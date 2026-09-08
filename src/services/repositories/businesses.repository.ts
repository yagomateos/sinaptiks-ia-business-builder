import { supabase } from '../supabase/client'
import { unwrap, toAppError, AppError } from '../supabase/errors'
import type { Business, BusinessMember, Industry, MemberRole, Profile, UUID } from '@/domain/types'

export interface BusinessWithRole extends Business {
  role: MemberRole
}

export interface CreateBusinessInput {
  name: string
  industry: Industry
  website?: string | null
  city?: string | null
  country?: string | null
  description?: string | null
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export const businessesRepository = {
  async listForCurrentUser(): Promise<BusinessWithRole[]> {
    const { data, error } = await supabase
      .from('business_members')
      .select('role, businesses(*)')
      .order('created_at', { ascending: true })

    if (error) throw toAppError(error, 'No hemos podido cargar tus negocios.')

    return (data ?? [])
      .filter((row) => row.businesses)
      .map((row) => ({
        ...(row.businesses as unknown as Business),
        role: row.role as MemberRole,
      }))
  },

  async getById(businessId: UUID): Promise<Business> {
    const result = await supabase.from('businesses').select('*').eq('id', businessId).single()
    return unwrap(result, 'No hemos encontrado este negocio.')
  },

  async create(input: CreateBusinessInput, ownerId: UUID): Promise<Business> {
    const baseSlug = slugify(input.name) || 'negocio'
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`

    const result = await supabase
      .from('businesses')
      .insert({
        owner_id: ownerId,
        name: input.name.trim(),
        slug,
        industry: input.industry,
        website: input.website?.trim() || null,
        city: input.city?.trim() || null,
        country: input.country?.trim() || null,
        description: input.description?.trim() || null,
      })
      .select()
      .single()

    return unwrap(result, 'No hemos podido crear el negocio.')
  },

  async update(businessId: UUID, patch: Partial<Business>): Promise<Business> {
    const result = await supabase
      .from('businesses')
      .update(patch)
      .eq('id', businessId)
      .select()
      .single()

    return unwrap(result, 'No hemos podido guardar los cambios.')
  },

  async remove(businessId: UUID): Promise<void> {
    const { error } = await supabase.from('businesses').delete().eq('id', businessId)
    if (error) throw toAppError(error, 'No hemos podido eliminar el negocio.')
  },

  async listMembers(businessId: UUID): Promise<(BusinessMember & { profile: Profile | null })[]> {
    const { data, error } = await supabase
      .from('business_members')
      .select('*, profiles(*)')
      .eq('business_id', businessId)

    if (error) throw toAppError(error, 'No hemos podido cargar el equipo.')

    return (data ?? []).map((row) => {
      const { profiles, ...member } = row as BusinessMember & { profiles: Profile | null }
      return { ...member, profile: profiles }
    })
  },

  async updateMemberRole(memberId: UUID, role: MemberRole): Promise<void> {
    const { error } = await supabase.from('business_members').update({ role }).eq('id', memberId)
    if (error) throw toAppError(error, 'No hemos podido cambiar el rol.')
  },

  async removeMember(memberId: UUID): Promise<void> {
    const { error } = await supabase.from('business_members').delete().eq('id', memberId)
    if (error) throw toAppError(error, 'No hemos podido quitar a esta persona.')
  },

  async getCurrentProfile(): Promise<Profile> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new AppError('No hay sesión iniciada.')

    const result = await supabase.from('profiles').select('*').eq('id', auth.user.id).single()
    return unwrap(result, 'No hemos podido cargar tu perfil.')
  },

  async updateProfile(userId: UUID, patch: Partial<Profile>): Promise<Profile> {
    const result = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select()
      .single()

    return unwrap(result, 'No hemos podido guardar tu perfil.')
  },
}
