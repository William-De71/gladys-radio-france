// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: feature names, widget contents, statuses, errors, toasts, scene
// outputs and the result of the configuration button. Vocabulary of the
// Gladys interface (appareil / Gerät / dispositivo); German says "du",
// Spanish "usted", like Gladys. The data of Radio France (titles, names) is
// never translated: the terms of use forbid altering it.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // The credit the terms of use require (art. 5.4.1), in every widget. The
  // French one is the exact sentence of the terms.
  credit: {
    en: 'data provided by the Radio France Open API',
    fr: 'données fournies par l’Open API Radio France',
    de: 'Daten bereitgestellt von der Open API von Radio France',
    es: 'datos proporcionados por la Open API de Radio France',
  },

  // Features (the station name comes first: "FIP - Track").
  feature_show: { en: 'Show', fr: 'Émission', de: 'Sendung', es: 'Programa' },
  feature_program: { en: 'Segment', fr: 'Séquence', de: 'Rubrik', es: 'Sección' },
  feature_track: { en: 'Track', fr: 'Morceau', de: 'Titel', es: 'Canción' },
  feature_follow: { en: 'Follow', fr: 'Suivi', de: 'Verfolgen', es: 'Seguimiento' },

  // Connection status (Integrations → Radio France).
  statusNoKey: {
    en: 'No Open API key: request one on developers.radiofrance.fr, then paste it in the configuration.',
    fr: 'Pas de clé Open API : demandez-en une sur developers.radiofrance.fr, puis collez-la dans la configuration.',
    de: 'Kein Open-API-Schlüssel: Beantrage einen auf developers.radiofrance.fr und füge ihn in der Konfiguration ein.',
    es: 'Sin clave de la Open API: solicite una en developers.radiofrance.fr y péguela en la configuración.',
  },
  statusAuth: {
    en: 'Radio France refuses the API key (missing, mistyped or not activated yet). Next try at {time}.',
    fr: 'Radio France refuse la clé d’API (absente, mal copiée ou pas encore activée). Nouvel essai à {time}.',
    de: 'Radio France lehnt den API-Schlüssel ab (fehlt, falsch kopiert oder noch nicht aktiviert). Neuer Versuch um {time}.',
    es: 'Radio France rechaza la clave de API (ausente, mal copiada o aún no activada). Nuevo intento a las {time}.',
  },
  statusQuota: {
    en: 'Daily quota of the Open API reached (1,000 requests per key): paused until {time}.',
    fr: 'Quota quotidien de l’Open API atteint (1 000 requêtes par clé) : pause jusqu’à {time}.',
    de: 'Tageskontingent der Open API erreicht (1.000 Anfragen pro Schlüssel): Pause bis {time}.',
    es: 'Cuota diaria de la Open API alcanzada (1.000 solicitudes por clave): pausa hasta las {time}.',
  },
  statusBudget: {
    en: 'Daily budget of the integration used ({count} requests): paused until {time}.',
    fr: 'Budget quotidien de l’intégration épuisé ({count} requêtes) : pause jusqu’à {time}.',
    de: 'Tagesbudget der Integration aufgebraucht ({count} Anfragen): Pause bis {time}.',
    es: 'Presupuesto diario de la integración agotado ({count} solicitudes): pausa hasta las {time}.',
  },
  statusError: {
    en: 'The Open API does not answer ({error}). Next try at {time}.',
    fr: 'L’Open API ne répond pas ({error}). Nouvel essai à {time}.',
    de: 'Die Open API antwortet nicht ({error}). Neuer Versuch um {time}.',
    es: 'La Open API no responde ({error}). Nuevo intento a las {time}.',
  },

  // Errors of the scene actions and of the widget button.
  errorUnknownStation: {
    en: 'Choose a Radio France station created in Gladys.',
    fr: 'Choisissez une station Radio France créée dans Gladys.',
    de: 'Wähle einen in Gladys angelegten Sender von Radio France.',
    es: 'Elija una emisora de Radio France creada en Gladys.',
  },
  errorNoKey: {
    en: 'No Open API key in the configuration.',
    fr: 'Pas de clé Open API dans la configuration.',
    de: 'Kein Open-API-Schlüssel in der Konfiguration.',
    es: 'No hay clave de la Open API en la configuración.',
  },
  errorBudget: {
    en: 'Daily request budget used: try again after {time}.',
    fr: 'Budget de requêtes du jour épuisé : réessayez après {time}.',
    de: 'Tagesbudget an Anfragen aufgebraucht: versuche es nach {time} erneut.',
    es: 'Presupuesto diario de solicitudes agotado: vuelva a intentarlo después de las {time}.',
  },
  errorAuth: {
    en: 'Radio France refuses the API key: check it in the configuration.',
    fr: 'Radio France refuse la clé d’API : vérifiez-la dans la configuration.',
    de: 'Radio France lehnt den API-Schlüssel ab: prüfe ihn in der Konfiguration.',
    es: 'Radio France rechaza la clave de API: compruébela en la configuración.',
  },
  errorApi: {
    en: 'The Open API did not answer ({error}).',
    fr: 'L’Open API n’a pas répondu ({error}).',
    de: 'Die Open API hat nicht geantwortet ({error}).',
    es: 'La Open API no ha respondido ({error}).',
  },

  // Configuration button "Test the API key".
  testOk: {
    en: 'Key accepted: {count} stations available. Requests today: {used} of {budget}.',
    fr: 'Clé acceptée : {count} stations disponibles. Requêtes aujourd’hui : {used} sur {budget}.',
    de: 'Schlüssel akzeptiert: {count} Sender verfügbar. Anfragen heute: {used} von {budget}.',
    es: 'Clave aceptada: {count} emisoras disponibles. Solicitudes hoy: {used} de {budget}.',
  },

  // Widget "Now on air".
  widgetNoStation: {
    en: 'Add a Radio France station in Integrations → Radio France → Discover, then choose it in the settings of this widget.',
    fr: 'Ajoutez une station Radio France dans Intégrations → Radio France → Découverte, puis choisissez-la dans les réglages de ce widget.',
    de: 'Füge einen Sender von Radio France unter Integrationen → Radio France → Entdecken hinzu und wähle ihn dann in den Einstellungen dieses Widgets.',
    es: 'Añada una emisora de Radio France en Integraciones → Radio France → Descubrir y elíjala en los ajustes de este widget.',
  },
  widgetWaiting: {
    en: 'Waiting for the first reading',
    fr: 'En attente du premier relevé',
    de: 'Warte auf die erste Abfrage',
    es: 'Esperando la primera lectura',
  },
  widgetShow: { en: 'Show', fr: 'Émission', de: 'Sendung', es: 'Programa' },
  widgetEpisode: { en: 'Episode', fr: 'Épisode', de: 'Folge', es: 'Episodio' },
  widgetProgram: { en: 'Segment', fr: 'Séquence', de: 'Rubrik', es: 'Sección' },
  widgetTrack: { en: 'Track', fr: 'Morceau', de: 'Titel', es: 'Canción' },
  widgetEnds: { en: 'Ends at', fr: 'Fin prévue', de: 'Endet um', es: 'Termina a las' },
  widgetUpdated: { en: 'Updated', fr: 'Mis à jour', de: 'Aktualisiert', es: 'Actualizado' },
  widgetFollow: { en: 'Follow', fr: 'Suivi', de: 'Verfolgen', es: 'Seguimiento' },
  widgetFollowOff: {
    en: 'Off: not asked',
    fr: 'Désactivé : pas interrogée',
    de: 'Aus: wird nicht abgefragt',
    es: 'Desactivado: no se consulta',
  },
  widgetNothing: {
    en: 'Nothing announced',
    fr: 'Rien d’annoncé',
    de: 'Nichts angekündigt',
    es: 'Nada anunciado',
  },
  widgetRefresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },

  // Widget "Upcoming shows".
  widgetOnAir: { en: 'On air', fr: 'En cours', de: 'Läuft', es: 'En antena' },
  widgetSchedule: { en: 'Schedule', fr: 'Programme', de: 'Programm', es: 'Programación' },
  widgetNotPublished: {
    en: 'Not published in advance',
    fr: 'Non publié à l’avance',
    de: 'Nicht im Voraus veröffentlicht',
    es: 'No publicada con antelación',
  },
  widgetLink: {
    en: 'Page of the show',
    fr: 'Page de l’émission',
    de: 'Seite der Sendung',
    es: 'Página del programa',
  },

  // Widget "API usage".
  widgetRequests: {
    en: 'Requests today',
    fr: 'Requêtes du jour',
    de: 'Anfragen heute',
    es: 'Solicitudes hoy',
  },
  widgetState: { en: 'State', fr: 'État', de: 'Status', es: 'Estado' },
  widgetStateOk: { en: 'OK', fr: 'OK', de: 'OK', es: 'Correcto' },
  widgetStateIdle: {
    en: 'No station followed',
    fr: 'Aucune station suivie',
    de: 'Kein Sender verfolgt',
    es: 'Ninguna emisora seguida',
  },
  widgetStateNoKey: {
    en: 'No API key',
    fr: 'Pas de clé d’API',
    de: 'Kein API-Schlüssel',
    es: 'Sin clave de API',
  },
  widgetStateAuth: {
    en: 'Key refused',
    fr: 'Clé refusée',
    de: 'Schlüssel abgelehnt',
    es: 'Clave rechazada',
  },
  widgetStateQuota: {
    en: 'Quota pause until {time}',
    fr: 'Pause quota jusqu’à {time}',
    de: 'Kontingentpause bis {time}',
    es: 'Pausa por cuota hasta {time}',
  },
  widgetStateBudget: {
    en: 'Budget used until {time}',
    fr: 'Budget épuisé jusqu’à {time}',
    de: 'Budget aufgebraucht bis {time}',
    es: 'Presupuesto agotado hasta {time}',
  },
  widgetStateError: {
    en: 'API unreachable',
    fr: 'API injoignable',
    de: 'API nicht erreichbar',
    es: 'API inaccesible',
  },
  widgetNextReading: {
    en: 'Next reading',
    fr: 'Prochain relevé',
    de: 'Nächste Abfrage',
    es: 'Próxima lectura',
  },
  widgetFollowed: {
    en: 'Stations followed',
    fr: 'Stations suivies',
    de: 'Verfolgte Sender',
    es: 'Emisoras seguidas',
  },
  widgetReset: {
    en: 'Counter reset',
    fr: 'Remise à zéro',
    de: 'Zähler-Reset',
    es: 'Puesta a cero',
  },
  widgetPaced: {
    en: 'Slowed down by the budget',
    fr: 'Ralenti par le budget',
    de: 'Durch das Budget gebremst',
    es: 'Ralentizado por el presupuesto',
  },
  widgetRhythm: { en: 'Rhythm', fr: 'Rythme', de: 'Takt', es: 'Ritmo' },
  widgetRhythmNormal: {
    en: 'Follows the programs',
    fr: 'Suit les programmes',
    de: 'Folgt dem Programm',
    es: 'Sigue la programación',
  },

  // Toasts of the "Refresh" button.
  toastRefreshed: {
    en: 'Updated: {station}',
    fr: 'Mis à jour : {station}',
    de: 'Aktualisiert: {station}',
    es: 'Actualizado: {station}',
  },
  toastTooSoon: {
    en: 'Already updated less than a minute ago.',
    fr: 'Déjà mis à jour il y a moins d’une minute.',
    de: 'Bereits vor weniger als einer Minute aktualisiert.',
    es: 'Ya se actualizó hace menos de un minuto.',
  },

  // Scene action "upcoming shows": the spoken summary.
  upcomingSummary: {
    en: 'Coming up on {station}: {list}.',
    fr: 'À venir sur {station} : {list}.',
    de: 'Demnächst auf {station}: {list}.',
    es: 'Próximamente en {station}: {list}.',
  },
  upcomingItem: {
    en: '{title} at {time}',
    fr: '{title} à {time}',
    de: '{title} um {time}',
    es: '{title} a las {time}',
  },
  upcomingNone: {
    en: 'No upcoming show announced on {station}.',
    fr: 'Aucune émission à venir annoncée sur {station}.',
    de: 'Keine kommende Sendung auf {station} angekündigt.',
    es: 'Ningún programa próximo anunciado en {station}.',
  },

  // Relative times.
  never: { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
};

/**
 * @description Whether a language is one of the four.
 * @param {*} language - The language.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(language) {
  return LANGUAGES.includes(language);
}

/**
 * @description A text in a language, with its values.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The values of the `{placeholders}`.
 * @returns {string} The text, the key itself when unknown.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string|Function} key - A TEXTS key, or `(language) => text`.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function'
        ? key(language)
        : t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description How long ago an instant was: "just now", "12 min ago".
 * @param {number} at - The instant, in ms (0: never).
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) {
    return t('never', language);
  }
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) {
    return t('justNow', language);
  }
  if (minutes < 60) {
    return t('minutesAgo', language, { n: minutes });
  }
  return t('hoursAgo', language, { n: Math.floor(minutes / 60) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago };
