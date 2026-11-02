export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 items-center px-6">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.03em]">
          <span className="grid size-6 place-items-center rounded-md bg-ink text-[13px] text-white">
            ✦
          </span>
          Goldsmith
        </span>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-5 pb-20 text-center">
        <h1 className="max-w-xl text-[44px] leading-[1.02] font-semibold tracking-[-0.045em] md:text-[56px]">
          A better dataset starts here.
        </h1>
        <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted">
          Label ten examples, review only the rows that matter, and ship an eval set whose quality
          is measured, not assumed.
        </p>
        {/* Full-page navigation: the OAuth flow redirects through Google. */}
        <a href="/api/auth/google/login" className="btn-primary mt-8 px-5 py-2.5 text-[14px]">
          Continue with Google
        </a>
      </main>
    </div>
  )
}
