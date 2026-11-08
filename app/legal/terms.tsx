import { LegalDoc } from '@/components/LegalDoc';
import { TERMS_SECTIONS } from '@/lib/legal';

// Public at /legal/terms on the web build.
export default function TermsOfUse() {
  return <LegalDoc title="Terms of Use" sections={TERMS_SECTIONS} />;
}
