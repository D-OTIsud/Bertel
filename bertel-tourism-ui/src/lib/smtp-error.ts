/** Un relais peut inclure des identifiants dans sa réponse : seuls ces diagnostics
 * connus peuvent être affichés, journalisés ou conservés en base. */
export function safeSmtpError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  return code === 'EAUTH' ? 'Authentification refusée. Vérifiez l’identifiant et le mot de passe.'
    : code === 'EDNS' || code === 'ENOTFOUND' ? 'Serveur SMTP introuvable. Vérifiez son nom.'
      : code === 'ETIMEDOUT' || code === 'ECONNECTION' ? 'Le serveur SMTP ne répond pas. Vérifiez l’hôte, le port et les accès réseau.'
        : code === 'ESOCKET' ? 'Connexion sécurisée impossible. Vérifiez le port et le mode TLS.'
          : 'L’opération SMTP a échoué. Vérifiez les paramètres et l’accès au relais.';
}
