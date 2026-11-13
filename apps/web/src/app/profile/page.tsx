import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { isSupabaseConfigured, createClient } from '@/lib/supabase/server';
import { getUserProfile, getUserPipelineCounts } from '@/lib/supabase/queries';
import { Navbar } from '@/components/layout/Navbar';
import { ProfileForm } from '@/components/profile/ProfileForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar user={null} />
        <main className="flex-1 mx-auto max-w-2xl w-full px-4 py-16 flex items-center justify-center">
          <div className="rounded-2xl border border-amber-200 bg-white p-8 shadow-xs text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200 mb-4">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Configuración de Supabase Requerida
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              El módulo de Perfil requiere que el entorno tenga configuradas las credenciales
              de Supabase (<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">NEXT_PUBLIC_SUPABASE_URL</code> y{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>).
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Volver al Radar público</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/profile');
  }

  const [profile, pipelineCounts] = await Promise.all([
    getUserProfile(),
    getUserPipelineCounts(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        user={{ id: user.id, email: user.email }}
        favoriteCount={pipelineCounts.favoriteCount}
        appliedCount={pipelineCounts.appliedCount}
      />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
        <ProfileForm initialProfile={profile} userEmail={user.email} />
      </main>
    </div>
  );
}
