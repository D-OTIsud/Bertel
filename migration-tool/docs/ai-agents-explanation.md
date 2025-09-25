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
    )
```

## 🎯 Prompts IA Utilisés

### **Prompt de Routage :**
```
"You classify establishment payload keys into specialised agents that prepare data for the DLL schema. Output a JSON object strictly matching the provided schema."

Agents available: identity: Creates or updates the canonical establishment entry., location: Handles address and geographic data., contact: Manages contact channels., amenities: Links establishment amenities., media: Processes media files., providers: Handles provider (prestataire) data with database lookup and creation., schedule: Handles opening hours and schedule data.

Payload keys: {"Nom_OTI": "Le Relais Commerson", "Coordonnées GPS": "-21.204197, 55.577417", ...}
```

### **Prompt de Transformation :**
```
"You are an ingestion agent that converts noisy establishment information into the Supabase DLL structure. Follow the schema strictly and avoid fabricating values."

Agent: providers. Payload: {"Prestataires": [{"data": [{"Presta ID": "AdJe0544bj", "Nom": "Adenor", ...}]}]}. Return only JSON that matches the expected schema.
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

### **3. Extensibilité**
- Ajout facile de nouveaux agents
- Prompts configurables
- Support multi-modèles (OpenAI, règles, etc.)

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
