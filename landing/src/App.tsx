import { Nav }             from './components/Nav'
import { Hero }            from './components/Hero'
import { PrivacySection }  from './components/PrivacySection'
import { HowItWorks }      from './components/HowItWorks'
import { FeatureCarousel } from './components/FeatureCarousel'
import { Philosophy }      from './components/Philosophy'
import { Footer }          from './components/Footer'

export function App() {
  return (
    <div className="min-h-screen bg-surface">
      <Nav />
      <main>
        <Hero />
        <PrivacySection />
        <HowItWorks />
        <FeatureCarousel />
        <Philosophy />
      </main>
      <Footer />
    </div>
  )
}
