import { MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";

/**
 * Farm Return auth shell (create account, sign in, password reset). Already Farm Return: the form sits on the warm
 * cream surface beside real Mapbox satellite imagery of Irish farmland (a real place, shown as texture — not the
 * farmer's farm and not a mock-up). No sidebar, no marketing; the form is the focus.
 */
const SATELLITE = mapboxConfigured
  ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/-8.712,53.318,15.3,0/900x1100@2x?access_token=${MAPBOX_TOKEN}`
  : null;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-fr-v2-cream lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div
        aria-hidden
        className="relative h-36 bg-fr-v2-forest-deep bg-cover bg-center lg:order-2 lg:h-auto lg:min-h-dvh"
        style={SATELLITE ? { backgroundImage: `url(${SATELLITE})` } : undefined}
        data-auth-imagery
      >
        <div className="absolute inset-0 bg-gradient-to-t from-fr-v2-forest-deep/70 via-fr-v2-forest-deep/20 to-transparent lg:bg-gradient-to-r lg:from-fr-v2-forest-deep/35 lg:via-transparent" />
        <span className="absolute bottom-0 left-0 h-[3px] w-full bg-fr-v2-gold lg:bottom-auto lg:top-0 lg:h-full lg:w-[3px]" />
      </div>
      <div className="flex flex-col px-6 pb-10 pt-8 sm:px-10 lg:min-h-dvh lg:justify-center lg:px-16">
        <p className="font-display text-[22px] tracking-tight text-fr-v2-forest-deep">Farm Return</p>
        <div className="mt-10 w-full max-w-[400px] lg:mt-14">{children}</div>
      </div>
    </div>
  );
}
