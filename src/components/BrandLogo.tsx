import "../styles/brand-logo.css";

type BrandLogoProps = {
  imageSrc?: string;
};

export function BrandLogo({ imageSrc }: BrandLogoProps) {
  if (imageSrc) {
    return (
      <img
        className="brand-logo brand-logo--image"
        src={imageSrc}
        alt="Serrian Tide"
      />
    );
  }

  return (
    <h1 className="brand-logo brand-logo--wordmark">
      <span className="brand-logo__serrian">SERRIAN</span>
      <span className="brand-logo__tide">TIDE</span>
    </h1>
  );
}
