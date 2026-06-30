import frenchMessages from 'ra-language-french';

const customFrenchMessages = {
  ...frenchMessages,
  duckdeploy: {
    bootstrap: {
      api_not_configured: {
        title: 'Le proxy API n\'est pas configuré',
        message: 'DuckDeploy a besoin d\'un proxy backend déployé avant que l\'interface utilisateur puisse appeler CDISC.',
        detail_1: 'Définissez VITE_API_BASE_URL à l\'URL de base du proxy déployé.',
        detail_2: 'Conservez CDISC_PRIMARY_KEY et CDISC_SECONDARY_KEY uniquement sur l\'hôte proxy ; ne les injectez pas dans le build frontend.',
      },
      no_resources: {
        title: 'Aucune ressource découverte',
        message: 'DuckDeploy a chargé le schéma et le manifeste, mais aucune ressource listable n\'était disponible pour React-Admin.',
        detail_1: 'Vérifiez que ui-manifest.json contient des champs de liste pour les ressources souhaitées.',
        detail_2: 'Si le contrat OpenAPI a changé, régénérez le manifeste avec `npm run generate` et recompilez l\'application.',
      },
      api_unreachable: {
        title: 'Le proxy API est inaccessible',
        message: 'DuckDeploy n\'a pas pu atteindre le proxy backend configuré.',
      },
      starting: {
        title: 'Démarrage de DuckDeploy',
        message: 'Chargement du schéma compilé, du manifeste UI et de la configuration du proxy backend.',
        detail_1: 'Base API : %{base_url}',
        detail_2: 'Les secrets CDISC restent sur le backend proxy ; le frontend ne communique qu\'avec ce proxy.',
      },
      failed: {
        title: 'Échec du démarrage de l\'application',
        message: 'DuckDeploy n\'a pas pu charger le schéma compilé ou le manifeste UI nécessaire au démarrage.',
      },
    },
    a11y: {
      status: {
        loading: 'Chargement des données',
        saving: 'Sauvegarde des données',
        success: 'Sauvegarde terminée',
        error_details: 'Échec de la sauvegarde : %{details}',
        error: 'Échec de la sauvegarde',
        empty: 'Liste vide',
        loaded: '%{details} éléments chargés',
      },
      polymorphic: {
        update: 'Structure du formulaire mise à jour pour %{name}.',
        update_default: 'Structure du formulaire mise à jour pour la nouvelle sélection.',
      },
    },
    input: {
      polymorphic: {
        select_type: 'Sélectionner le type',
        option: 'Option %{index}',
      },
    },
  },
};

export default customFrenchMessages;
