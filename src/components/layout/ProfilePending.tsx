export function ProfilePending() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy2 px-4 text-center">
      <div className="mb-2 text-2xl">⏳</div>
      <div className="mb-1 text-lg font-extrabold text-white">Profile not ready yet</div>
      <p className="max-w-sm text-[13px] text-white/50">
        Your account row hasn't been created on the server yet. This usually means the
        <span className="mx-1 font-semibold text-teal">handle_new_user</span>
        trigger (from supabase/schema.sql) hasn't been applied to your Supabase project.
      </p>
    </div>
  );
}
