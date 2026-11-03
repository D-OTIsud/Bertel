import type { ObjectWorkspaceMenu } from '../../../../services/object-workspace-parser';
import {
  buildExtractionPrompt,
  parseExtraction,
  mapExtractionToMenu,
  type AllowedOption,
} from './extraction';
import { callVisionExtraction, ProviderError, type ProviderConfig, type VisionImage } from './provider';

/**
 * Testable orchestration for /api/menu/extract (Phase 2): provider lookup → vision call → parse
 * (with one repair retry) → map to a draft menu. Pure of HTTP/Supabase concerns; the route injects
 * the real deps (active provider from Vault, images downloaded from Storage). See spec §5.
 */

export interface OrchestrateInput {
  menuTitle: string;
  allowedSections: AllowedOption[];
  allowedDietary: AllowedOption[];
  images: VisionImage[];
  lang?: string;
  reportUnsupportedOffers?: boolean;
}

export interface OrchestrateDeps {
  getActiveProvider: () => Promise<{ config: ProviderConfig; apiKey: string | null } | null>;
  callProvider?: typeof callVisionExtraction;
  signal?: AbortSignal;
  /** Partner jobs meter one provider attempt; the existing office flow keeps repair by default. */
  repairInvalidJson?: boolean;
}

export type OrchestrateResult =
  | { ok: true; menu: ObjectWorkspaceMenu; suggestedDietaryByDish: string[][];
      warnings?: { code: 'formula_price_not_modelled'; message: string; offers: {label:string;price:string;reason:string}[] }[] }
  | { ok: false; code: 'no_images' | 'not_configured' | 'provider_error' | 'unparseable'; detail: string };

export async function orchestrateExtraction(
  input: OrchestrateInput,
  deps: OrchestrateDeps,
): Promise<OrchestrateResult> {
  if (input.images.length === 0) {
    return { ok: false, code: 'no_images', detail: 'aucune image à analyser' };
  }

  const provider = await deps.getActiveProvider();
  if (!provider) {
    return { ok: false, code: 'not_configured', detail: "aucun fournisseur IA actif n'est configuré" };
  }

  const callProvider = deps.callProvider ?? callVisionExtraction;
  const prompt = buildExtractionPrompt({
    allowedSections: input.allowedSections,
    allowedDietary: input.allowedDietary,
    lang: input.lang,
    reportUnsupportedOffers: input.reportUnsupportedOffers,
  });

  async function attempt(userPrompt: string) {
    const { text } = await callProvider(provider!.config, provider!.apiKey, input.images, {
      system: prompt.system,
      user: userPrompt,
    }, { signal: deps.signal });
    return parseExtraction(text);
  }

  try {
    let parsed = await attempt(prompt.user);
    if (!parsed.ok && deps.repairInvalidJson !== false) {
      // one repair retry — tell the model exactly what was wrong
      parsed = await attempt(
        `${prompt.user}\n\nTon précédent retour n'était pas un JSON valide (${parsed.error}). Réponds UNIQUEMENT avec le JSON conforme au schéma.`,
      );
    }
    if (!parsed.ok) {
      return { ok: false, code: 'unparseable', detail: parsed.error };
    }
    const { menu, suggestedDietaryByDish } = mapExtractionToMenu(parsed.data, {
      menuTitle: input.menuTitle,
      allowedSections: input.allowedSections,
      allowedDietary: input.allowedDietary,
      lang: input.lang,
    });
    return { ok: true, menu, suggestedDietaryByDish, ...(input.reportUnsupportedOffers ? {warnings:[{
      code:'formula_price_not_modelled' as const,
      message:'Vérifiez les formules de la carte : leur prix global ne peut pas être publié comme prix de plat. Les offres signalées restent à vérifier dans la source.',
      offers:(parsed.data.unsupported_offers??[]).map(offer=>({label:offer.label,price:offer.price===undefined?'':String(offer.price),reason:offer.reason||'formula_price_not_modelled'})),
    }]} : {}) };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, code: 'provider_error', detail: err.message };
    }
    throw err;
  }
}
