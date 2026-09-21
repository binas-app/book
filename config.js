// Binas App Configuration
// ========================
// Pas deze instellingen aan om de app te configureren.

const BINAS_CONFIG = {
  // Versie informatie
  version: "Versie 1.0.0",
  
  // Copyright tekst
  copyright: "2026 Binas.app",
  
  // Credit zichtbaarheid
  // true = "Gemaakt door Roy van der Sande" wordt getoond
  // false = Credit wordt verborgen
  showCredit: false,

  // Firebase configuratie
  // Custom auth domein voor Firebase hosting en login
  authDomain: "account.binas.app",
  
  // Admin configuratie
  // Email adressen die toegang hebben tot het admin panel
  primaryAdmin: "mail@royvds.nl",
};

// Export voor gebruik in andere scripts
if (typeof window !== 'undefined') {
  window.BINAS_CONFIG = BINAS_CONFIG;
}

export default BINAS_CONFIG;
