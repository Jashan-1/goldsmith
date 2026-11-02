export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="w-80 rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-amber-600">Goldsmith</h1>
        <p className="mt-2 text-sm text-stone-500">Golden eval datasets, measured.</p>
        {/* Full-page navigation: the OAuth flow redirects through Google. */}
        <a
          href="/api/auth/google/login"
          className="mt-6 block rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600"
        >
          Continue with Google
        </a>
      </div>
    </div>
  )
}
