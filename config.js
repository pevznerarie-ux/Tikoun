// Tikoun · configuration du stockage en ligne (facultatif).
// Laisse vide pour stocker les données dans le navigateur de chaque appareil.
// Rempli (voir SUPABASE.md) : tous les professeurs partagent les mêmes données.
// La clé « anon / publishable » est publique par nature : l'accès est protégé par les comptes professeurs.
window.TIKOUN_CONFIG = {
  supabaseUrl: "",        // ex. "https://abcdxyz.supabase.co"
  supabaseAnonKey: "",    // Project Settings → API Keys → clé publishable / anon
  aiProxy: true           // true = l'IA passe par la fonction « ai » (clé API gardée sur le serveur)
};
