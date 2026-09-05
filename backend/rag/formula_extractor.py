"""
Formula extraction utilities.
Extracts LaTeX formulas and mathematical symbols from text.
Preserves formulas in metadata while converting text for embedding.
"""

import logging
import re
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)


class FormulaExtractor:
    """Extract and process LaTeX formulas from text."""

    # LaTeX patterns
    INLINE_MATH_PATTERN = r'\$([^$]+)\$'  # $...$
    DISPLAY_MATH_PATTERN = r'\$\$([^$]+)\$\$'  # $$...$$
    EQUATION_PATTERN = r'\\begin\{equation\}(.*?)\\end\{equation\}'  # \begin{equation}...\end{equation}
    ALIGN_PATTERN = r'\\begin\{align\}(.*?)\\end\{align\}'  # \begin{align}...\end{align}

    @staticmethod
    def extract_formulas(text: str) -> Tuple[str, List[Dict]]:
        """
        Extract formulas from text, returning cleaned text and formula list.

        Args:
            text: Raw text with LaTeX formulas

        Returns:
            Tuple of (cleaned_text, formulas_list)
            where formulas_list contains: [{"latex": "...", "description": "...", "position": "inline/display"}]
        """
        formulas = []
        cleaned_text = text

        # Extract display math ($$...$$) first, as they're usually more important
        display_matches = list(re.finditer(FormulaExtractor.DISPLAY_MATH_PATTERN, text))
        for i, match in enumerate(reversed(display_matches)):
            latex = match.group(1).strip()
            if latex:
                formulas.append({
                    "latex": f"$${latex}$$",
                    "description": FormulaExtractor.latex_to_description(latex),
                    "position": "display"
                })
                # Replace formula in text with placeholder
                cleaned_text = cleaned_text[:match.start()] + f"[Formula {i+1}]" + cleaned_text[match.end():]

        # Extract inline math ($...$)
        inline_matches = list(re.finditer(FormulaExtractor.INLINE_MATH_PATTERN, text))
        for i, match in enumerate(reversed(inline_matches)):
            latex = match.group(1).strip()
            if latex and not any(f["latex"] == f"${latex}$" for f in formulas):
                formulas.append({
                    "latex": f"${latex}$",
                    "description": FormulaExtractor.latex_to_description(latex),
                    "position": "inline"
                })
                # Replace formula in text with placeholder
                cleaned_text = cleaned_text[:match.start()] + f"[Formula {i+1}]" + cleaned_text[match.end():]

        # Extract equation environments
        eq_matches = list(re.finditer(FormulaExtractor.EQUATION_PATTERN, text, re.DOTALL))
        for i, match in enumerate(reversed(eq_matches)):
            latex = match.group(1).strip()
            if latex:
                formulas.append({
                    "latex": f"\\begin{{equation}}{latex}\\end{{equation}}",
                    "description": FormulaExtractor.latex_to_description(latex),
                    "position": "display"
                })

        # Extract align environments
        align_matches = list(re.finditer(FormulaExtractor.ALIGN_PATTERN, text, re.DOTALL))
        for i, match in enumerate(reversed(align_matches)):
            latex = match.group(1).strip()
            if latex:
                formulas.append({
                    "latex": f"\\begin{{align}}{latex}\\end{{align}}",
                    "description": FormulaExtractor.latex_to_description(latex),
                    "position": "display"
                })

        # Reverse formulas list since we processed in reverse order
        formulas.reverse()

        logger.info(f"Extracted {len(formulas)} formulas from text")

        return cleaned_text, formulas

    @staticmethod
    def latex_to_description(latex: str) -> str:
        """
        Convert LaTeX formula to a human-readable description.
        This is a simple heuristic; for complex formulas, returns the LaTeX as-is with minimal processing.

        Args:
            latex: LaTeX formula

        Returns:
            Description string
        """
        # Dictionary of common LaTeX patterns and their meanings
        descriptions = {
            r'\\frac{': "fraction",
            r'\\sqrt{': "square root",
            r'\\sum': "summation",
            r'\\int': "integral",
            r'\\prod': "product",
            r'\\partial': "partial derivative",
            r'\\delta': "change in",
            r'\\Delta': "change in",
            r'\\alpha': "alpha",
            r'\\beta': "beta",
            r'\\gamma': "gamma",
            r'\\theta': "theta",
            r'\\lambda': "lambda",
            r'\\mu': "mu",
            r'\\sigma': "sigma",
            r'\\Sigma': "sigma sum",
            r'\\pi': "pi",
            r'\\infty': "infinity",
            r'\\times': "multiplication",
            r'\\geq': "greater than or equal to",
            r'\\leq': "less than or equal to",
            r'\\neq': "not equal to",
            r'\\approx': "approximately equal to",
            r'\\propto': "proportional to",
        }

        description = latex.strip()

        # For simple formulas, try to make sense of them
        if len(latex) < 50:
            # Check for common patterns
            for pattern, meaning in descriptions.items():
                if pattern in latex:
                    description = f"{meaning} (in {latex})"
                    break

            # Try to identify common equations
            if "=" in latex:
                # Extract variable names (single letters) from both sides
                parts = latex.split("=")
                if len(parts) == 2:
                    left = "".join(re.findall(r'[a-zA-Z]', parts[0]))
                    right = "".join(re.findall(r'[a-zA-Z]', parts[1]))
                    if left and right:
                        description = f"{left} equals {right}"

        return description

    @staticmethod
    def count_symbols(text: str) -> float:
        """
        Calculate symbol density (ratio of mathematical symbols to total characters).

        Returns:
            Float between 0 and 1
        """
        if not text:
            return 0.0

        # Common mathematical symbols
        math_symbols = set(r'$∫∑∏√π∞±⁻¹²³ℝℤℚℂΣΔλμσθαβγδεζηϕψω∂∇⊕⊗∗ℵ∈∉∝≈≠≤≥')

        symbol_count = sum(1 for c in text if c in math_symbols)
        return symbol_count / len(text)

    @staticmethod
    def preprocess_text_with_formulas(text: str) -> Tuple[str, List[Dict], float]:
        """
        Comprehensive preprocessing: extract formulas, clean text, calculate symbol density.

        Returns:
            Tuple of (cleaned_text, formulas, symbol_density)
        """
        cleaned_text, formulas = FormulaExtractor.extract_formulas(text)
        symbol_density = FormulaExtractor.count_symbols(cleaned_text)

        # Add formula descriptions to text for better embedding
        if formulas:
            formula_descriptions = " ".join([f["description"] for f in formulas])
            cleaned_text = f"{cleaned_text}\n\n[Mathematical Content]: {formula_descriptions}"

        return cleaned_text, formulas, symbol_density


if __name__ == "__main__":
    # Test formula extraction
    test_text = """
    The second law of thermodynamics states that entropy increases over time.
    In mathematical form, $dS/dt \\geq 0$, where $S$ is entropy and $t$ is time.
    
    The fundamental equation is:
    $$dU = \\delta Q - \\delta W$$
    
    For reversible processes:
    $$dS = \\frac{\\delta Q}{T}$$
    
    Where $T$ is absolute temperature.
    """

    cleaned, formulas, density = FormulaExtractor.preprocess_text_with_formulas(test_text)
    print("Cleaned Text:")
    print(cleaned)
    print(f"\nFormulas ({len(formulas)}):")
    for f in formulas:
        print(f"  - {f['latex']} -> {f['description']}")
    print(f"\nSymbol Density: {density:.2%}")
