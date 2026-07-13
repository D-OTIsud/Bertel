export interface HelpUrlState {
  query?: string | null;
  question?: string | null;
}

/** Build a shareable /aide URL. Stable param order: q, then question. */
export function buildHelpUrl(state: HelpUrlState): string {
  const params = new URLSearchParams();
  const query = state.query?.trim();
  const question = state.question?.trim();
  if (query) params.set('q', query);
  if (question) params.set('question', question);
  const search = params.toString();
  return search ? `/aide?${search}` : '/aide';
}

/** Compare semantic q/question values (trimmed) between current URL and desired state. */
export function helpUrlMatches(
  searchParams: URLSearchParams,
  state: HelpUrlState,
): boolean {
  const currentQ = searchParams.get('q')?.trim() ?? '';
  const desiredQ = state.query?.trim() ?? '';
  const currentQuestion = searchParams.get('question')?.trim() ?? '';
  const desiredQuestion = state.question?.trim() ?? '';
  return currentQ === desiredQ && currentQuestion === desiredQuestion;
}
