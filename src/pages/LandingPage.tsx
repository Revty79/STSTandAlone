import { BrandLogo } from "../components/BrandLogo";
import "../styles/landing-page.css";

export function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-page__content">
        <BrandLogo />
        <button className="landing-page__enter-button" type="button">
          Enter Your Imagination
        </button>
      </section>
    </main>
  );
}
