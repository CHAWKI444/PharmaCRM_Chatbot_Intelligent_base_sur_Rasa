"""Ancien featurizer CamemBERT, hors du pipeline actif.

Rasa 3 n'expose plus l'API Component utilisée ici, et ce composant était
déclaré avant le tokenizer alors qu'il exige des tokens. Le pipeline de
config.yml utilise désormais les featurizers standards de Rasa.
"""

from typing import Any, Optional, Text, Dict

try:
    from rasa.nlu.components import Component
    from rasa.nlu.config import RasaNLUModelConfig
    from rasa.shared.nlu.training_data.message import Message
    from rasa.shared.nlu.training_data.training_data import TrainingData
except ImportError:  # Rasa 3
    class Component:
        def __init__(self, component_config=None):
            self.component_config = component_config or {}

    class RasaNLUModelConfig:
        pass

    class Message:
        pass

    class TrainingData:
        pass

try:
    from transformers import AutoTokenizer, AutoModel
    import torch
except ImportError:
    AutoTokenizer = None
    AutoModel = None
    torch = None


class HuggingFaceTransformer(Component):
    """Custom NLU component using Hugging Face transformers."""

    # Nom du composant
    name = "HuggingFaceTransformer"

    # Dépendances
    provides = ["text_features"]
    requires = ["tokens"]
    defaults = {"model_name": "camembert-base", "device": "cpu"}
    language_list = ["fr"]

    def __init__(self, component_config: Dict[Text, Any] = None, model: Any = None, tokenizer: Any = None):
        super().__init__(component_config)
        self.model_name = self.component_config.get("model_name")
        self.device = self.component_config.get("device")
        self.tokenizer = tokenizer
        self.model = model

    def train(self, training_data: TrainingData, config: RasaNLUModelConfig, **kwargs) -> None:
        """Charge et entraîne le modèle transformer."""
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.model = AutoModel.from_pretrained(self.model_name).to(self.device)
        self.model.eval()  # Mode évaluation

    def process(self, message: Message, **kwargs) -> None:
        """Extrait les features textuelles à partir des tokens."""
        tokens = message.get("tokens")
        if not tokens:
            return

        # Convertir les tokens en entrée pour le modèle
        text = " ".join([token.text for token in tokens])
        inputs = self.tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512).to(self.device)

        # Obtenir les embeddings
        with torch.no_grad():
            outputs = self.model(**inputs)
            embeddings = outputs.last_hidden_state.mean(dim=1).squeeze().cpu().numpy()

        # Ajouter les embeddings au message
        message.set("text_features", embeddings)

    def persist(self, file_name: Text, model_dir: Text) -> Dict[Text, Any]:
        """Sauvegarde le modèle et le tokenizer."""
        model_path = None
        tokenizer_path = None
        if self.model and self.tokenizer:
            model_path = f"{model_dir}/{file_name}_model"
            tokenizer_path = f"{model_dir}/{file_name}_tokenizer"
            self.model.save_pretrained(model_path)
            self.tokenizer.save_pretrained(tokenizer_path)
        return {"model_path": model_path, "tokenizer_path": tokenizer_path}

    @classmethod
    def load(
        cls,
        meta: Dict[Text, Any],
        model_dir: Optional[Text] = None,
        model_metadata: Optional["Metadata"] = None,
        cached_component: Optional["Component"] = None,
        **kwargs
    ) -> "HuggingFaceTransformer":
        """Charge le modèle et le tokenizer depuis le disque."""
        if cached_component:
            return cached_component
        if not model_dir:
            return cls(meta)

        model_path = meta.get("model_path")
        tokenizer_path = meta.get("tokenizer_path")
        tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
        model = AutoModel.from_pretrained(model_path).to(meta.get("device", "cpu"))
        return cls(meta, model, tokenizer)