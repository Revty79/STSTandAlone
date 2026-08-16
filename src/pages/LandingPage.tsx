import { BrandLogo } from "../components/BrandLogo";
import "../styles/landing-page.css";

type LandingPageProps = {
  onEnter: () => void;
};

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <main className="landing-page">
      <section className="landing-page__content">
        <BrandLogo />
        <button
          className="landing-page__enter-button"
          type="button"
          onClick={onEnter}
        >
          Enter Your Imagination
        </button>
      </section>
    </main>
  );
}
