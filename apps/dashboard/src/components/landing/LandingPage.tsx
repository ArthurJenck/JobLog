import { LandingNavbar } from './LandingNavbar';
import { LandingHero } from './LandingHero';
import { LandingFeature } from './LandingFeature';
import { LandingBenefits } from './LandingBenefits';
import { LandingSources } from './LandingSources';
import { LandingSeoGuide } from './LandingSeoGuide';
import { LandingPricing } from './LandingPricing';
import { LandingFooter } from './LandingFooter';
import {
  MousePointerClick,
  Link2,
  Workflow,
  Bell,
  Sparkles,
  Lightbulb,
  FolderOpen,
  BarChart2,
} from 'lucide-react';

const FEATURE_1_BULLETS = [
  {
    icon: MousePointerClick,
    label: "Extension navigateur sur 13 sites d'emploi",
  },
  { icon: Link2, label: 'Import automatique en collant une URL' },
  { icon: Workflow, label: 'Statut mis à jour automatiquement' },
  { icon: Bell, label: 'Relances automatiques par email et notifications web' },
];

const FEATURE_2_BULLETS = [
  { icon: Sparkles, label: 'Compétences présentes et manquantes détectées' },
  {
    icon: Lightbulb,
    label: 'Conseils concrets pour adapter votre candidature',
  },
  { icon: FolderOpen, label: 'Gérez plusieurs versions de CV' },
  { icon: BarChart2, label: "Suivez l'avancement de chaque candidature" },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNavbar />
      <LandingHero />
      <div id="features">
        <LandingFeature
          eyebrow="Capture en 1 clic"
          title="Enregistrez une offre depuis n'importe quel site"
          description="L'extension JobLog s'intègre directement sur 13 sites d'emploi français et internationaux. En un clic, la fiche est dans votre tableau de bord de candidatures — ou collez simplement une URL pour que l'IA la remplisse automatiquement."
          bullets={FEATURE_1_BULLETS}
          image="/images/feature-1.webp"
          imageAlt="Tableau de bord de suivi de candidatures"
          imageWidth={2880}
          imageHeight={2000}
        />
        <LandingFeature
          eyebrow="Analyse IA"
          title="Analysez votre CV face à chaque offre"
          description="JobLog compare votre CV à l'offre et identifie les compétences présentes, manquantes et à mettre en valeur. Gérez plusieurs versions de CV, adaptez votre candidature à chaque opportunité et gardez le prochain suivi sous contrôle."
          bullets={FEATURE_2_BULLETS}
          image="/images/feature-2.webp"
          imageAlt="Interface d'analyse CV face à une offre d'emploi"
          imageWidth={1016}
          imageHeight={1230}
          reversed
        />
      </div>
      <LandingBenefits />
      <LandingSeoGuide />
      <LandingSources />
      <LandingPricing />
      <LandingFooter />
    </div>
  );
}
