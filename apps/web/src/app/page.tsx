import Link from 'next/link';
import type { Route } from 'next';

const quickLinks: Array<{
  href: Route;
  title: string;
  description: string;
}> = [
  {
    href: '/problems',
    title: 'Browse problems',
    description: 'Open the problem bank, filter by difficulty, and jump straight into solving.',
  },
  {
    href: '/dashboard',
    title: 'Open dashboard',
    description: 'Review progress, streaks, recent submissions, and AI study insights.',
  },
  {
    href: '/create',
    title: 'Create a problem',
    description: 'Use the authoring workflow to draft, generate, and publish new challenges.',
  },
];

const highlights = [
  'Live coding workspace with verdict tracking',
  'AI explanations, hints, and review flows',
  'Assessments and org dashboards for teams',
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-gray-50">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.16),_transparent_28%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 sm:px-10 lg:px-12">
        <div className="max-w-3xl">
          <p className="animate-slide-up text-sm font-semibold uppercase tracking-[0.32em] text-brand-300">
            CodeForge AI
          </p>
          <h1 className="animate-slide-up mt-6 text-5xl font-black tracking-tight text-white sm:text-6xl">
            Ship from the homepage into the real product.
          </h1>
          <p className="animate-slide-up mt-6 max-w-2xl text-lg leading-8 text-gray-300 sm:text-xl">
            The app already has core routes for practice, dashboards, and problem creation. This
            landing page now gives you clear entry points instead of a static dead end.
          </p>

          <div className="animate-slide-up mt-8 flex flex-wrap gap-3">
            <Link
              href="/problems"
              className="rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-brand-400"
            >
              Start solving
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-gray-100 transition-colors duration-200 hover:border-brand-400/60 hover:text-white"
            >
              View dashboard
            </Link>
          </div>
        </div>

        <div className="animate-slide-up-delayed mt-14 grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-400">
              Quick access
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group rounded-2xl border border-white/10 bg-[#0b1224] p-5 transition-transform duration-200 hover:-translate-y-1 hover:border-brand-400/50 hover:bg-[#101936]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-white">{link.title}</h2>
                    <span className="text-brand-300 transition-transform duration-200 group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-gray-400">{link.description}</p>
                </Link>
              ))}
            </div>
          </section>

          <aside className="rounded-[28px] border border-brand-400/20 bg-brand-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-200">
              What is here already
            </p>
            <ul className="mt-5 space-y-4">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-6 text-gray-200">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-brand-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-6 text-gray-300">
              If you want, we can make this page smarter next by showing auth-aware actions,
              featured problems, or recent activity.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
