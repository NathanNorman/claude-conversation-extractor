"""
Conversation Viewer - Rich interactive viewer for Claude conversations

Provides:
- Full conversation display with formatting
- Syntax highlighting for code blocks
- Scrollable view with keyboard navigation
- Search within conversation
- Export and action capabilities
"""

import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List

# Platform-specific imports
if sys.platform == "win32":
    pass
else:
    pass


@dataclass
class ViewerState:
    """Maintains the state of the conversation viewer"""

    conversation: List[Dict] = None
    current_line: int = 0
    total_lines: int = 0
    search_query: str = ""
    search_results: List[int] = None
    search_index: int = 0
    viewport_height: int = 20
    viewport_width: int = 80

    def __post_init__(self):
        if self.conversation is None:
            self.conversation = []
        if self.search_results is None:
            self.search_results = []


class ConversationViewer:
    """Rich interactive viewer for Claude conversations"""

    # ANSI color codes for rich display
    COLORS = {
        "RESET": "\033[0m",
        "BOLD": "\033[1m",
        "DIM": "\033[2m",
        "UNDERLINE": "\033[4m",
        "REVERSE": "\033[7m",
        # Foreground colors
        "BLACK": "\033[30m",
        "RED": "\033[31m",
        "GREEN": "\033[32m",
        "YELLOW": "\033[33m",
        "BLUE": "\033[34m",
        "MAGENTA": "\033[35m",
        "CYAN": "\033[36m",
        "WHITE": "\033[37m",
        # Bright foreground colors
        "BRIGHT_BLACK": "\033[90m",
        "BRIGHT_RED": "\033[91m",
        "BRIGHT_GREEN": "\033[92m",
        "BRIGHT_YELLOW": "\033[93m",
        "BRIGHT_BLUE": "\033[94m",
        "BRIGHT_MAGENTA": "\033[95m",
        "BRIGHT_CYAN": "\033[96m",
        "BRIGHT_WHITE": "\033[97m",
        # Background colors
        "BG_BLACK": "\033[40m",
        "BG_RED": "\033[41m",
        "BG_GREEN": "\033[42m",
        "BG_YELLOW": "\033[43m",
        "BG_BLUE": "\033[44m",
        "BG_MAGENTA": "\033[45m",
        "BG_CYAN": "\033[46m",
        "BG_WHITE": "\033[47m",
    }

    # Code language mappings for syntax highlighting
    CODE_LANGUAGES = {
        "python": ["py", "python", "python3"],
        "javascript": ["js", "javascript", "node", "nodejs"],
        "typescript": ["ts", "typescript", "tsx"],
        "java": ["java"],
        "cpp": ["cpp", "c++", "cc", "cxx"],
        "c": ["c"],
        "rust": ["rust", "rs"],
        "go": ["go", "golang"],
        "ruby": ["rb", "ruby"],
        "php": ["php"],
        "sql": ["sql", "mysql", "postgresql", "sqlite"],
        "bash": ["bash", "sh", "shell", "zsh"],
        "json": ["json"],
        "yaml": ["yaml", "yml"],
        "xml": ["xml"],
        "html": ["html", "htm"],
        "css": ["css", "scss", "sass"],
        "markdown": ["md", "markdown"],
    }

    def __init__(self, jsonl_path: Path):
        """Initialize the conversation viewer with a JSONL file"""
        self.jsonl_path = jsonl_path
        self.state = ViewerState()
        self.formatted_lines = []
        self.load_conversation()
        self._get_terminal_size()

    def _get_terminal_size(self):
        """Get terminal dimensions"""
        try:
            import shutil

            cols, rows = shutil.get_terminal_size()
            self.state.viewport_width = cols
            self.state.viewport_height = rows - 5  # Leave room for header/footer
        except Exception:
            # Fallback dimensions
            self.state.viewport_width = 80
            self.state.viewport_height = 20

    def load_conversation(self):
        """Load and parse the conversation from JSONL"""
        self.state.conversation = []

        try:
            with open(self.jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        entry = json.loads(line.strip())
                        if entry.get("type") in ["user", "assistant"]:
                            self.state.conversation.append(entry)
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            print(f"Error loading conversation: {e}")
            return

        # Format the conversation for display
        self._format_conversation()

    def _extract_content(self, entry: Dict) -> str:
        """Extract text content from a message entry"""
        # Handle test format
        if "content" in entry and isinstance(entry["content"], str):
            return entry["content"]

        # Handle actual Claude log format
        if "message" in entry:
            msg = entry["message"]
            if isinstance(msg, dict):
                content = msg.get("content", "")

                # Handle different content formats
                if isinstance(content, list):
                    text_parts = []
                    for item in content:
                        if isinstance(item, dict) and item.get("type") == "text":
                            text_parts.append(item.get("text", ""))
                        elif isinstance(item, str):
                            text_parts.append(item)
                    return "\n".join(text_parts)
                elif isinstance(content, str):
                    return content

        return ""

    def _format_conversation(self):
        """Format the conversation into displayable lines with styling"""
        self.formatted_lines = []

        for i, entry in enumerate(self.state.conversation):
            speaker = "Human" if entry.get("type") == "user" else "Assistant"
            content = self._extract_content(entry)

            # Add timestamp if available
            timestamp_str = entry.get("timestamp", "")
            if timestamp_str:
                try:
                    timestamp = datetime.fromisoformat(
                        timestamp_str.replace("Z", "+00:00")
                    )
                    time_str = timestamp.strftime("%Y-%m-%d %H:%M:%S")
                except Exception:
                    time_str = ""
            else:
                time_str = ""

            # Add speaker header
            if speaker == "Human":
                header_color = self.COLORS["BRIGHT_CYAN"]
                icon = "👤"
            else:
                header_color = self.COLORS["BRIGHT_GREEN"]
                icon = "🤖"

            header = f"{header_color}{self.COLORS['BOLD']}{icon} {speaker}"
            if time_str:
                header += f" {self.COLORS['DIM']}[{time_str}]"
            header += self.COLORS["RESET"]

            self.formatted_lines.append("")
            self.formatted_lines.append("─" * self.state.viewport_width)
            self.formatted_lines.append(header)
            self.formatted_lines.append("")

            # Process and format content
            formatted_content = self._format_content(content)
            self.formatted_lines.extend(formatted_content)

        self.state.total_lines = len(self.formatted_lines)

    def _format_content(self, content: str) -> List[str]:
        """Format content with code highlighting and word wrapping"""
        lines = []

        # Split content into parts (code blocks and regular text)
        parts = re.split(r"(```[\s\S]*?```)", content)

        for part in parts:
            if part.startswith("```"):
                # Code block
                lines.extend(self._format_code_block(part))
            else:
                # Regular text
                lines.extend(self._wrap_text(part))

        return lines

    def _format_code_block(self, code_block: str) -> List[str]:
        """Format a code block with syntax highlighting"""
        lines = []

        # Extract language and code
        match = re.match(r"```(\w+)?\n?([\s\S]*?)```", code_block)
        if match:
            language = match.group(1) or ""
            code = match.group(2)

            # Add code block header
            if language:
                lines.append(
                    f"{self.COLORS['BG_BLACK']}{self.COLORS['BRIGHT_YELLOW']} {language} {self.COLORS['RESET']}"
                )
            else:
                lines.append(
                    f"{self.COLORS['BG_BLACK']}{self.COLORS['BRIGHT_YELLOW']} code {self.COLORS['RESET']}"
                )

            # Add code lines with basic syntax highlighting
            code_lines = code.split("\n")
            for code_line in code_lines:
                highlighted = self._highlight_code_line(code_line, language)
                lines.append(
                    f"{self.COLORS['BG_BLACK']}{highlighted}{self.COLORS['RESET']}"
                )

        return lines

    def _highlight_code_line(self, line: str, language: str) -> str:
        """Apply basic syntax highlighting to a code line"""
        # This is a simplified version - could be enhanced with proper lexing
        highlighted = line

        # Common patterns for various languages
        patterns = {
            "comment": (r"(#.*$|//.*$|/\*.*?\*/)", self.COLORS["BRIGHT_BLACK"]),
            "string": (r'(".*?"|\'.*?\')', self.COLORS["GREEN"]),
            "number": (
                r"(\b\d+\.?\d*\b)",
                self.COLORS["CYAN"],
            ),  # Added capturing group
            "keyword": (
                r"(\b(?:def|class|import|from|if|else|elif|for|while|return|try|except|with|as|in|is|not|and|or|True|False|None)\b)",
                self.COLORS["MAGENTA"],
            ),
            "function": (r"\b([a-zA-Z_]\w*)\s*\(", self.COLORS["YELLOW"]),
        }

        # Apply patterns based on language
        if language.lower() in ["python", "py"]:
            for name, (pattern, color) in patterns.items():
                highlighted = re.sub(
                    pattern,
                    f"{color}\\1{self.COLORS['RESET']}{self.COLORS['BG_BLACK']}",
                    highlighted,
                )

        return highlighted

    def _wrap_text(self, text: str, indent: int = 0) -> List[str]:
        """Wrap text to fit terminal width"""
        lines = []
        max_width = self.state.viewport_width - indent - 2

        for paragraph in text.split("\n"):
            if not paragraph:
                lines.append("")
                continue

            # Simple word wrapping
            words = paragraph.split()
            current_line = ""

            for word in words:
                if len(current_line) + len(word) + 1 <= max_width:
                    if current_line:
                        current_line += " " + word
                    else:
                        current_line = word
                else:
                    if current_line:
                        lines.append(" " * indent + current_line)
                    current_line = word

            if current_line:
                lines.append(" " * indent + current_line)

        return lines

    def draw(self):
        """Draw the current viewport"""
        # Clear screen
        print("\033[2J\033[H", end="")

        # Draw header
        self._draw_header()

        # Draw content
        start_line = self.state.current_line
        end_line = min(start_line + self.state.viewport_height, self.state.total_lines)

        for i in range(start_line, end_line):
            if i < len(self.formatted_lines):
                line = self.formatted_lines[i]

                # Highlight search matches
                if self.state.search_query and i in self.state.search_results:
                    line = self._highlight_search_match(line)

                # Truncate if too wide
                if len(line) > self.state.viewport_width:
                    line = line[: self.state.viewport_width - 3] + "..."

                print(line)

        # Fill remaining viewport
        lines_shown = end_line - start_line
        for _ in range(self.state.viewport_height - lines_shown):
            print()

        # Draw footer
        self._draw_footer()

    def _draw_header(self):
        """Draw the header with file info"""
        project = self.jsonl_path.parent.name
        filename = self.jsonl_path.name
        msg_count = len(self.state.conversation)

        header = f"📄 {project}/{filename} | {msg_count} messages"
        print(
            f"{self.COLORS['REVERSE']}{header:<{self.state.viewport_width}}{self.COLORS['RESET']}"
        )

    def _draw_footer(self):
        """Draw the footer with navigation hints"""
        # Calculate scroll percentage
        if self.state.total_lines > 0:
            percent = int(
                (
                    self.state.current_line
                    / max(1, self.state.total_lines - self.state.viewport_height)
                )
                * 100
            )
        else:
            percent = 0

        # Build footer text
        footer_parts = []

        if self.state.search_query:
            match_count = len(self.state.search_results)
            current_match = self.state.search_index + 1 if match_count > 0 else 0
            footer_parts.append(
                f"Search: '{self.state.search_query}' ({current_match}/{match_count})"
            )

        footer_parts.append(f"{percent}%")

        # Navigation hints
        hints = "[j/k:scroll] [/:search] [n/N:next/prev] [a:actions] [q:back]"

        footer = " | ".join(footer_parts) + " " + hints
        print(
            f"{self.COLORS['REVERSE']}{footer:<{self.state.viewport_width}}{self.COLORS['RESET']}"
        )

    def _highlight_search_match(self, line: str) -> str:
        """Highlight search matches in a line"""
        if not self.state.search_query:
            return line

        # Case-insensitive highlighting
        pattern = re.compile(re.escape(self.state.search_query), re.IGNORECASE)
        return pattern.sub(
            f"{self.COLORS['BG_YELLOW']}{self.COLORS['BLACK']}\\g<0>{self.COLORS['RESET']}",
            line,
        )

    def scroll_up(self, lines: int = 1):
        """Scroll up by specified lines"""
        self.state.current_line = max(0, self.state.current_line - lines)

    def scroll_down(self, lines: int = 1):
        """Scroll down by specified lines"""
        max_scroll = max(0, self.state.total_lines - self.state.viewport_height)
        self.state.current_line = min(max_scroll, self.state.current_line + lines)

    def page_up(self):
        """Scroll up by one page"""
        self.scroll_up(self.state.viewport_height - 1)

    def page_down(self):
        """Scroll down by one page"""
        self.scroll_down(self.state.viewport_height - 1)

    def go_to_top(self):
        """Jump to the beginning"""
        self.state.current_line = 0

    def go_to_bottom(self):
        """Jump to the end"""
        max_scroll = max(0, self.state.total_lines - self.state.viewport_height)
        self.state.current_line = max_scroll

    def search(self, query: str):
        """Search for text in the conversation"""
        if not query:
            self.state.search_query = ""
            self.state.search_results = []
            self.state.search_index = 0
            return

        self.state.search_query = query
        self.state.search_results = []

        # Find all lines containing the query (case-insensitive)
        query_lower = query.lower()
        for i, line in enumerate(self.formatted_lines):
            # Strip ANSI codes for searching
            clean_line = re.sub(r"\033\[[0-9;]*m", "", line)
            if query_lower in clean_line.lower():
                self.state.search_results.append(i)

        # Jump to first result if found
        if self.state.search_results:
            self.state.search_index = 0
            self.state.current_line = self.state.search_results[0]

    def next_search_result(self):
        """Jump to next search result"""
        if not self.state.search_results:
            return

        self.state.search_index = (self.state.search_index + 1) % len(
            self.state.search_results
        )
        self.state.current_line = self.state.search_results[self.state.search_index]

    def prev_search_result(self):
        """Jump to previous search result"""
        if not self.state.search_results:
            return

        self.state.search_index = (self.state.search_index - 1) % len(
            self.state.search_results
        )
        self.state.current_line = self.state.search_results[self.state.search_index]

    def get_conversation_text(self) -> str:
        """Get the full conversation as plain text"""
        lines = []
        for entry in self.state.conversation:
            speaker = "Human" if entry.get("type") == "user" else "Assistant"
            content = self._extract_content(entry)
            lines.append(f"\n{'=' * 60}")
            lines.append(f"{speaker}:")
            lines.append(content)

        return "\n".join(lines)

    def get_conversation_markdown(self) -> str:
        """Get the conversation formatted as markdown"""
        lines = ["# Claude Conversation\n"]

        # Add metadata
        lines.append(f"**File:** {self.jsonl_path.name}")
        lines.append(f"**Project:** {self.jsonl_path.parent.name}")
        lines.append(f"**Messages:** {len(self.state.conversation)}\n")
        lines.append("---\n")

        # Add conversation
        for entry in self.state.conversation:
            speaker = "Human" if entry.get("type") == "user" else "Assistant"
            content = self._extract_content(entry)

            # Add timestamp if available
            timestamp_str = entry.get("timestamp", "")
            if timestamp_str:
                try:
                    timestamp = datetime.fromisoformat(
                        timestamp_str.replace("Z", "+00:00")
                    )
                    time_str = timestamp.strftime("%Y-%m-%d %H:%M:%S")
                    lines.append(f"### {speaker} *[{time_str}]*\n")
                except Exception:
                    lines.append(f"### {speaker}\n")
            else:
                lines.append(f"### {speaker}\n")

            lines.append(content)
            lines.append("\n---\n")

        return "\n".join(lines)
