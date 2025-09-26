# 🤖 Comment l'IA Fonctionne dans les Agents

## Vue d'Ensemble

Les agents utilisent maintenant l'IA de deux façons :

1. **Routage Intelligent** : L'IA décide quels champs vont à quel agent
2. **Transformation Intelligente** : L'IA transforme les données brutes en structures structurées

## 🧠 Architecture IA

### 1. Routage des Champs (Field Router)

```python
# L'IA analyse le payload et décide :
payload = {
    "Nom_OTI": "Le Relais Commerson",        # → IdentityAgent
    "Coordonnées GPS": "-21.204197, 55.577417", # → LocationAgent
    "Contact principale": "0262275287",      # → ContactAgent
    "Prestataires": [...],                   # → ProviderAgent
    "horaires": [...]                        # → ScheduleAgent
}
```

### 2. Transformation par Agent

Chaque agent utilise l'IA pour transformer ses données :

#### **ProviderAgent avec IA :**
```python
# AVANT (règles manuelles) :
def _extract_provider_record(self, data):
    provider_id = data.get("Presta ID")
    last_name = data.get("Nom")
    # ... mapping manuel

# MAINTENANT (IA) :
transformation = await self.llm.transform_fragment(
    agent_name="providers",
    payload=payload,
    response_model=ProviderTransformation,
    context=context.snapshot(),
)
```

#### **ScheduleAgent avec IA :**
```python
# AVANT (règles manuelles) :
def _parse_days(self, jours_str):
    day_mapping = {"lundi": "monday", ...}
    # ... parsing manuel

# MAINTENANT (IA) :
transformation = await self.llm.transform_fragment(
    agent_name="schedule",
    payload=payload,
    response_model=ScheduleTransformation,
    context=context.snapshot(),
)
```

## 🔄 Flux de Traitement IA

### 1. **Reception du Payload**
```
Webhook → Coordinator → Field Router (IA)
```

### 2. **Routage Intelligent**
```python
# L'IA analyse et route :
{
    "identity": {"Nom_OTI": "Le Relais Commerson", ...},
    "location": {"Coordonnées GPS": "-21.204197, 55.577417", ...},
    "contact": {"Contact principale": "0262275287", ...},
    "providers": {"Prestataires": [...]},
    "schedule": {"horaires": [...]}
}
```

### 3. **Transformation par Agent**
```python
# Chaque agent utilise l'IA pour transformer ses données :
for agent_name, agent_payload in routed_data.items():
    transformation = await agent.llm.transform_fragment(
        agent_name=agent_name,
        payload=agent_payload,
        response_model=AgentSpecificModel,
        context=context.snapshot(),
    )
```

## 🎯 Prompts IA Utilisés

Les prompts système sont centralisés dans un `PromptLibrary`. Cette bibliothèque est partagée entre
le routeur, les agents spécialisés et le nouvel **VerificationAgent**. Elle permet d'ajuster les
instructions sans modifier le code grâce à un historique d'erreurs observées.

### **Prompt de Routage (modifiable) :**
```
"You are the field routing orchestrator for a Supabase-based migration pipeline. Map each incoming key to the dedicated agent responsible for that part of the schema so that data lands in the correct table instead of an unstructured blob. Honour the expected_fields for every agent, preserve canonical identity information, and place only unknown or out-of-scope values in leftovers. Return JSON that strictly conforms to the response schema."

Agent catalogue: [{"name": "identity", "description": "Creates or updates the canonical establishment entry.", "expected_fields": ["establishment_name", ...]}, ...]

Payload to analyse: {"Nom_OTI": "Le Relais Commerson", "Coordonnées GPS": "-21.204197, 55.577417", ...}
```

### **Prompt de Transformation (modifiable par agent) :**
```
"You are an ingestion specialist collaborating with other agents to populate the Supabase DLL schema. Honour relationships (object, contact, location, providers, amenities, schedule) and only emit attributes that belong to your table. If another agent shared identifiers in the context, reuse them instead of inventing new ones."

Agent: providers. Shared context: {"object_id": "OBJ-123", "shared_state": {"identity": {"object_id": "OBJ-123"}}}. Fragment to normalise: {"Prestataires": [{"data": [{"Presta ID": "AdJe0544bj", "Nom": "Adenor", ...}]}]}. Produce JSON that matches the schema exactly, leaving absent fields null or empty without guessing.
```

## 🚀 Avantages de l'IA

### **1. Flexibilité**
- L'IA s'adapte aux variations de format
- Gestion des champs manquants ou mal nommés
- Support de structures de données complexes

### **2. Robustesse**
- Fallback sur règles heuristiques (RuleBasedLLM)
- Gestion d'erreurs intelligente
- Validation de schéma automatique
- Ajustement automatique des prompts lors d'erreurs répétées

### **3. Extensibilité**
- Ajout facile de nouveaux agents
- Prompts configurables et persistants
- Support multi-modèles (OpenAI, règles, etc.)

## 🛡️ Agent de Vérification

- Observe toutes les insertions via la mémoire partagée (`AgentContext.shared_state` et `agent_events`).
- Identifie les erreurs récurrentes et ajoute des consignes ciblées dans `PromptLibrary` pour l'agent concerné.
- Publie ses décisions dans la mémoire partagée afin que les agents suivants disposent des mêmes ajustements.
- Émet des événements de télémétrie (`agent.verification.prompt_adjusted`) pour suivre les corrections appliquées.

## 🗂️ Agent des Codes de Référence

- Centralise les créations et recherches dans `ref_code_*` pour éviter que chaque agent interroge Supabase directement.
- Maintient un cache mémoire partagé afin de réutiliser instantanément les codes les plus demandés sans requête réseau.
- Expose des helpers (`context.ensure_reference_code` / `context.lookup_reference_code`) afin que chaque agent récupère uniquement les identifiants nécessaires à son domaine.
- Le coordinateur filtre désormais les fragments pour ne laisser passer que les champs listés dans `expected_fields`, réduisant ainsi le bruit envoyé aux agents spécialisés.

## 🔧 Configuration IA

### **Variables d'Environnement :**
```bash
MIGRATION_AI_PROVIDER=openai          # ou "rule-based"
MIGRATION_AI_MODEL=gpt-4o-mini       # modèle OpenAI
MIGRATION_OPENAI_API_KEY=sk-...      # clé API OpenAI
MIGRATION_AI_TEMPERATURE=0.0         # créativité (0=déterministe)
```

### **Fallback Automatique :**
```python
# Si OpenAI n'est pas disponible → RuleBasedLLM
# Si transformation échoue → Logs + continuation
# Si agent échoue → Webhook de notification
```

## 📊 Monitoring IA

### **Télémétrie :**
```python
# Chaque opération IA est tracée :
telemetry.record("agent.providers.transform", {
    "payload": payload,
    "transformation": transformation,
    "llm_used": "openai-gpt-4o-mini"
})
```

### **Dashboard :**
- Nombre de transformations IA par agent
- Temps de réponse des modèles
- Taux de succès/échec
- Utilisation des fallbacks

## 🎯 Exemple Concret

### **Payload Entrant :**
```json
{
    "Nom_OTI": "Le Relais Commerson",
    "Prestataires": [{
        "data": [{
            "Presta ID": "AdJe0544bj",
            "Nom": "Adenor",
            "Prénom": "Jean-Luc",
            "Email": "loc.amarysreunion@orange.fr"
        }]
    }],
    "horaires": [{
        "data": [{
            "jours": "Mercredi , Jeudi , Vendredi , Samedi , Dimanche",
            "AM_Start": "09:30",
            "AM_Finish": "15:00"
        }]
    }]
}
```

### **Sortie IA :**
```json
{
    "providers": {
        "providers": [{
            "provider_id": "AdJe0544bj",
            "last_name": "Adenor",
            "first_name": "Jean-Luc",
            "email": "loc.amarysreunion@orange.fr",
            "legacy_ids": ["AdJe0544bj"]
        }]
    },
    "schedule": {
        "schedules": [{
            "days": ["wednesday", "thursday", "friday", "saturday", "sunday"],
            "am_start": "09:30",
            "am_finish": "15:00",
            "reservation_required": false,
            "schedule_type": "regular"
        }]
    }
}
```

## 🔮 Évolutions Futures

1. **Prompts Spécialisés** : Prompts spécifiques par domaine (restaurant, hôtel, etc.)
2. **Apprentissage** : Amélioration continue basée sur les données
3. **Validation IA** : Vérification de cohérence des données
4. **Génération IA** : Création automatique de descriptions, tags, etc.

---

**L'IA rend votre système de migration intelligent, flexible et robuste !** 🚀
