# api/app/services/wc_data.py
"""
Módulo para consultar dados do WooCommerce do arquivo JSON
"""
import json
from pathlib import Path
from typing import Dict, List, Optional, Any

# Caminho do arquivo JSON (tenta múltiplos caminhos)
_base_path = Path(__file__).parent.parent.parent
WC_DATA_FILE = _base_path / "arejano_wc_data.json"
# Fallback: também tenta no diretório api/ e no diretório raiz do app
if not WC_DATA_FILE.exists():
    WC_DATA_FILE = _base_path / "api" / "arejano_wc_data.json"
if not WC_DATA_FILE.exists():
    # No container Docker, o arquivo está em /app/
    WC_DATA_FILE = Path("/app/arejano_wc_data.json")

# Cache do arquivo carregado
_wc_data_cache: Optional[Dict[str, Any]] = None


def _load_wc_data() -> Dict[str, Any]:
    """Carrega o arquivo JSON do WooCommerce (com cache)"""
    global _wc_data_cache
    
    if _wc_data_cache is not None:
        return _wc_data_cache
    
    if not WC_DATA_FILE.exists():
        print(f"⚠️ Arquivo não encontrado: {WC_DATA_FILE}")
        print(f"   Tentando caminhos alternativos...")
        # Tenta outros caminhos possíveis
        alt_paths = [
            Path("/app/arejano_wc_data.json"),  # Container Docker
            Path("/app/api/arejano_wc_data.json"),
            Path.cwd() / "arejano_wc_data.json",
            Path.cwd() / "api" / "arejano_wc_data.json",
            _base_path / "arejano_wc_data.json",  # Tenta novamente com base_path
        ]
        for alt_path in alt_paths:
            if alt_path.exists():
                print(f"✅ Encontrado em: {alt_path}")
                try:
                    with open(alt_path, "r", encoding="utf-8") as f:
                        _wc_data_cache = json.load(f)
                    print(f"✅ Carregado {len(_wc_data_cache.get('products', []))} produtos")
                    return _wc_data_cache
                except Exception as e:
                    print(f"❌ Erro ao carregar {alt_path}: {e}")
        
        print(f"❌ Nenhum arquivo encontrado. Retornando dados vazios.")
        return {"products": [], "attributes": {}, "variations": {}}
    
    try:
        with open(WC_DATA_FILE, "r", encoding="utf-8") as f:
            _wc_data_cache = json.load(f)
        print(f"✅ Carregado {len(_wc_data_cache.get('products', []))} produtos de {WC_DATA_FILE}")
        return _wc_data_cache
    except Exception as e:
        print(f"❌ Erro ao carregar arejano_wc_data.json: {e}")
        return {"products": [], "attributes": {}, "variations": {}}


def _normalize_text(text: str) -> str:
    """Normaliza texto para busca (remove acentos, espaços, etc.)"""
    if not text:
        return ""
    import unicodedata
    import re
    # Remove acentos
    text = unicodedata.normalize('NFD', text)
    text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
    # Minúsculas e remove espaços extras
    text = text.lower().strip()
    # Normaliza variações comuns
    text = text.replace("pra", "para").replace("pro", "para o")
    # Remove caracteres especiais mas mantém hífens e espaços
    text = re.sub(r'[^\w\s-]', '', text)
    # Normaliza espaços múltiplos
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def lookup_product(query: str) -> Optional[Dict[str, Any]]:
    """
    Busca um produto por nome ou slug (busca flexível)
    
    Args:
        query: Nome ou slug do produto
        
    Returns:
        Dicionário com dados do produto ou None se não encontrar
    """
    data = _load_wc_data()
    products = data.get("products", [])
    
    if not products:
        return None
    
    query_normalized = _normalize_text(query)
    query_words = set(query_normalized.split())
    
    # 1. Busca exata por slug
    for product in products:
        slug = _normalize_text(product.get("slug", ""))
        if slug == query_normalized:
            return product
    
    # 2. Busca exata por nome
    for product in products:
        name = _normalize_text(product.get("name", ""))
        if name == query_normalized:
            return product
    
    # 3. Busca por palavras-chave com scoring
    best_match = None
    best_score = 0
    
    for product in products:
        name = _normalize_text(product.get("name", ""))
        slug = _normalize_text(product.get("slug", ""))
        description = _normalize_text(product.get("description_clean", ""))
        
        # Conta quantas palavras da query estão no nome/slug
        name_words = set(name.split())
        slug_words = set(slug.split())
        
        # Score baseado em palavras correspondentes
        name_matches = len(query_words & name_words)
        slug_matches = len(query_words & slug_words)
        
        # Prioriza correspondências no nome
        score = (name_matches * 3) + (slug_matches * 2)
        
        # Bônus alto se a query está contida no nome ou vice-versa
        if query_normalized in name:
            score += 20
        if name in query_normalized and len(name) > 5:
            score += 15
        if query_normalized in slug:
            score += 10
        if slug in query_normalized and len(slug) > 5:
            score += 8
        
        # Bônus se todas as palavras principais estão presentes
        if len(query_words) >= 2:
            important_words = [w for w in query_words if len(w) >= 3]
            if important_words:
                matches_in_name = sum(1 for w in important_words if w in name)
                matches_in_slug = sum(1 for w in important_words if w in slug)
                if matches_in_name == len(important_words):
                    score += 15
                elif matches_in_slug == len(important_words):
                    score += 10
        
        if score > best_score:
            best_score = score
            best_match = product
    
    # Retorna se encontrou uma correspondência razoável
    # Aceita se score >= 3 (pelo menos uma palavra importante) ou match parcial significativo
    if best_match:
        name_normalized = _normalize_text(best_match.get("name", ""))
        # Se pelo menos 50% das palavras importantes estão presentes, ou match parcial
        important_words = [w for w in query_words if len(w) >= 3]
        if important_words:
            matches = sum(1 for w in important_words if w in name_normalized)
            if matches >= len(important_words) * 0.5 or best_score >= 3:
                return best_match
        elif best_score >= 2 or query_normalized in name_normalized:
            return best_match
    
    # 4. Busca parcial mais agressiva (qualquer palavra importante)
    for product in products:
        name = _normalize_text(product.get("name", ""))
        slug = _normalize_text(product.get("slug", ""))
        
        # Verifica se palavras importantes da query estão no nome/slug
        important_words = [w for w in query_words if len(w) >= 3]
        if important_words:
            matches = sum(1 for w in important_words if w in name or w in slug)
            # Se pelo menos uma palavra importante está presente, retorna
            if matches > 0:
                return product
    
    # 5. Última tentativa: busca por substring (caso a normalização tenha removido algo importante)
    query_simple = query.lower().strip()
    for product in products:
        name_simple = product.get("name", "").lower()
        slug_simple = product.get("slug", "").lower()
        
        # Se a query está contida no nome ou vice-versa (sem normalização)
        if query_simple in name_simple or name_simple in query_simple:
            return product
        if query_simple in slug_simple or slug_simple in query_simple:
            return product
    
    return None


def search_products(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Busca produtos por nome (pode retornar múltiplos) - busca flexível
    
    Args:
        query: Termo de busca
        limit: Número máximo de resultados
        
    Returns:
        Lista de produtos encontrados (ordenados por relevância)
    """
    data = _load_wc_data()
    products = data.get("products", [])
    
    if not products:
        return []
    
    query_normalized = _normalize_text(query)
    query_words = set(query_normalized.split())
    results_with_score = []
    
    for product in products:
        name = _normalize_text(product.get("name", ""))
        slug = _normalize_text(product.get("slug", ""))
        description = _normalize_text(product.get("description_clean", ""))
        
        # Calcula score de relevância
        score = 0
        
        # Match exato no nome
        if query_normalized == name:
            score += 100
        # Match exato no slug
        elif query_normalized == slug:
            score += 90
        # Query contida no nome
        elif query_normalized in name:
            score += 50
        # Query contida no slug
        elif query_normalized in slug:
            score += 40
        # Nome contido na query
        elif name in query_normalized and len(name) > 3:
            score += 30
        
        # Conta palavras correspondentes
        name_words = set(name.split())
        slug_words = set(slug.split())
        name_matches = len(query_words & name_words)
        slug_matches = len(query_words & slug_words)
        score += (name_matches * 5) + (slug_matches * 3)
        
        # Match na descrição (menor peso)
        if query_normalized in description:
            score += 10
        
        # Match parcial de palavras
        for word in query_words:
            if len(word) >= 3:
                if word in name:
                    score += 2
                if word in slug:
                    score += 1
        
        if score > 0:
            results_with_score.append((score, product))
    
    # Ordena por score (maior primeiro) e retorna
    results_with_score.sort(key=lambda x: x[0], reverse=True)
    return [product for _, product in results_with_score[:limit]]


def get_product_price(product_slug: str, attributes: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
    """
    Obtém preço de um produto, considerando variações se for produto variável
    
    Args:
        product_slug: Slug do produto
        attributes: Dicionário com atributos (ex: {"pa_tamanho": "90x50mm", "pa_quantidade": "1000"})
        
    Returns:
        Dicionário com informações de preço ou None
    """
    product = lookup_product(product_slug)
    if not product:
        return None
    
    # Produto simples
    if product.get("type") == "simple":
        price_info = product.get("price_info", {})
        return {
            "product_name": product.get("name"),
            "product_slug": product.get("slug"),
            "type": "simple",
            "price": price_info.get("price"),
            "regular_price": price_info.get("regular_price"),
            "sale_price": price_info.get("sale_price"),
            "on_sale": price_info.get("on_sale", False),
            "link": product.get("permalink", "")
        }
    
    # Produto variável - busca variação correspondente
    if product.get("type") == "variable" and attributes:
        data = _load_wc_data()
        variations = data.get("variations", {}).get(product_slug, [])
        
        # Tenta encontrar variação que corresponda aos atributos
        for variation in variations:
            var_attrs = variation.get("attributes", {})
            match = True
            
            for attr_name, attr_value in attributes.items():
                # Normaliza nome do atributo (pode vir com ou sem pa_)
                attr_key = attr_name.replace("pa_", "").replace("attribute_pa_", "")
                var_value = var_attrs.get(attr_name) or var_attrs.get(attr_key)
                
                if not var_value or var_value.lower() != attr_value.lower():
                    match = False
                    break
            
            if match:
                return {
                    "product_name": product.get("name"),
                    "product_slug": product.get("slug"),
                    "type": "variation",
                    "variation_id": variation.get("id"),
                    "price": variation.get("price"),
                    "regular_price": variation.get("regular_price"),
                    "sale_price": variation.get("sale_price"),
                    "on_sale": variation.get("on_sale", False),
                    "link": variation.get("link", product.get("permalink", "")),
                    "attributes": var_attrs
                }
        
        # Se não encontrou variação exata, retorna preço base do produto
        price_info = product.get("price_info", {})
        return {
            "product_name": product.get("name"),
            "product_slug": product.get("slug"),
            "type": "variable",
            "price": price_info.get("price"),
            "regular_price": price_info.get("regular_price"),
            "note": "Preço base do produto. Preço final varia conforme atributos selecionados.",
            "link": product.get("permalink", "")
        }
    
    # Produto variável sem atributos - retorna preço base
    price_info = product.get("price_info", {})
    return {
        "product_name": product.get("name"),
        "product_slug": product.get("slug"),
        "type": "variable",
        "price": price_info.get("price"),
        "regular_price": price_info.get("regular_price"),
        "note": "Este produto tem variações. O preço depende dos atributos selecionados.",
        "link": product.get("permalink", "")
    }


def get_product_attributes(product_slug: str) -> Optional[Dict[str, Any]]:
    """
    Obtém atributos disponíveis para um produto
    
    Args:
        product_slug: Slug do produto
        
    Returns:
        Dicionário com atributos e suas opções ou None
    """
    product = lookup_product(product_slug)
    if not product:
        return None
    
    attributes = product.get("attributes", [])
    if not attributes:
        return {"product_slug": product_slug, "attributes": []}
    
    result = {
        "product_slug": product_slug,
        "product_name": product.get("name"),
        "attributes": []
    }
    
    for attr in attributes:
        result["attributes"].append({
            "id": attr.get("id"),
            "name": attr.get("name"),
            "slug": attr.get("slug"),
            "options": attr.get("options", [])
        })
    
    return result


def get_product_variations(product_slug: str) -> List[Dict[str, Any]]:
    """
    Obtém todas as variações de um produto variável
    
    Args:
        product_slug: Slug do produto
        
    Returns:
        Lista de variações
    """
    data = _load_wc_data()
    variations = data.get("variations", {}).get(product_slug, [])
    
    # Retorna apenas informações essenciais
    return [
        {
            "id": v.get("id"),
            "price": v.get("price"),
            "regular_price": v.get("regular_price"),
            "sale_price": v.get("sale_price"),
            "on_sale": v.get("on_sale", False),
            "attributes": v.get("attributes", {}),
            "link": v.get("link", "")
        }
        for v in variations
    ]


def get_product_description(product_slug: str) -> Optional[Dict[str, Any]]:
    """
    Obtém descrição de um produto
    
    Args:
        product_slug: Slug do produto
        
    Returns:
        Dicionário com descrições ou None
    """
    product = lookup_product(product_slug)
    if not product:
        return None
    
    return {
        "product_name": product.get("name"),
        "product_slug": product.get("slug"),
        "description": product.get("description_clean", ""),
        "short_description": product.get("short_description_clean", ""),
        "link": product.get("permalink", "")
    }


def build_product_link(product_slug: str, attributes: Optional[Dict[str, str]] = None) -> Optional[str]:
    """
    Constrói link completo para um produto com atributos
    
    Args:
        product_slug: Slug do produto
        attributes: Dicionário com atributos (ex: {"pa_tamanho": "90x50mm"})
        
    Returns:
        URL completa ou None
    """
    product = lookup_product(product_slug)
    if not product:
        return None
    
    base_url = product.get("permalink", "")
    
    if not attributes:
        return base_url
    
    # Constrói query string
    query_parts = []
    for attr_name, attr_value in attributes.items():
        # Normaliza nome do atributo
        if not attr_name.startswith("attribute_pa_"):
            if attr_name.startswith("pa_"):
                attr_name = f"attribute_{attr_name}"
            else:
                attr_name = f"attribute_pa_{attr_name}"
        
        # Converte valor para slug (minúsculas, hífens)
        value_slug = attr_value.lower().replace(" ", "-").replace("(", "").replace(")", "")
        query_parts.append(f"{attr_name}={value_slug}")
    
    if query_parts:
        return f"{base_url}?{'&'.join(query_parts)}"
    
    return base_url

