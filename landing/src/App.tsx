import { useState } from 'react'
import { Nav }             from './components/Nav'
import { Hero }            from './components/Hero'
import { FeatureCarousel } from './components/FeatureCarousel'
import { PrivacySection }  from './components/PrivacySection'
import { HowItWorks }      from './components/HowItWorks'
import { Philosophy }      from './components/Philosophy'
import { Footer }          from './components/Footer'
import { InstallModal }    from './components/InstallModal'

export function App() {
  const [installOpen, setInstallOpen] = useState(false)

  return (
    <div className="min-h-screen bg-surface">
      <Nav />
      <main>
        <Hero onInstall={() => setInstallOpen(true)} />
        <FeatureCarousel />
        <PrivacySection />
        <HowItWorks />
        <Philosophy />
      </main>
      <Footer />
      <InstallModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  )
}
