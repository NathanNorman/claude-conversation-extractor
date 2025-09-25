"""
Action Menu - Interactive menu for conversation actions

Provides various actions:
- Copy to clipboard
- Open in system editor
- Show file path
- Extract to file
- Open in Claude Code with context
"""

import os
import platform
import subprocess
import tempfile
from pathlib import Path
from typing import Optional
from uuid import uuid4

try:
    import pyperclip

    CLIPBOARD_AVAILABLE = True
except ImportError:
    CLIPBOARD_AVAILABLE = False
    print("Note: Install pyperclip for clipboard support: pip install pyperclip")


class ActionMenu:
    """Interactive action menu for conversation operations"""

    # ANSI colors for menu display
    COLORS = {
        "RESET": "\033[0m",
        "BOLD": "\033[1m",
        "DIM": "\033[2m",
        "REVERSE": "\033[7m",
        "GREEN": "\033[92m",
        "YELLOW": "\033[93m",
        "BLUE": "\033[94m",
        "CYAN": "\033[96m",
        "WHITE": "\033[97m",
    }

    def __init__(self, viewer):
        """Initialize action menu with a conversation viewer"""
        self.viewer = viewer
        self.last_action_result = ""

    def display_menu(self) -> str:
        """Display the action menu and return selected action"""
        print("\033[2J\033[H")  # Clear screen

        # Header
        print(f"{self.COLORS['REVERSE']}{'=' * 60}{self.COLORS['RESET']}")
        print(
            f"{self.COLORS['BOLD']}{self.COLORS['CYAN']}📋 ACTION MENU{self.COLORS['RESET']}"
        )
        print(
            f"{self.COLORS['DIM']}Project: {self.viewer.jsonl_path.parent.name}{self.COLORS['RESET']}"
        )
        print(
            f"{self.COLORS['DIM']}File: {self.viewer.jsonl_path.name}{self.COLORS['RESET']}"
        )
        print("=" * 60)
        print()

        # Menu options
        menu_items = [
            ("1", "📋 Copy full conversation to clipboard", self.COLORS["GREEN"]),
            ("2", "📄 Copy as Markdown", self.COLORS["GREEN"]),
            ("3", "✂️  Copy selected portion", self.COLORS["YELLOW"]),
            ("4", "📝 Open in system editor", self.COLORS["BLUE"]),
            ("5", "📁 Show file path", self.COLORS["CYAN"]),
            ("6", "💾 Extract to file", self.COLORS["WHITE"]),
            ("7", "🤖 Create Claude Code context", self.COLORS["GREEN"]),
            ("", "", ""),
            ("B", "⬅️  Back to viewer", self.COLORS["DIM"]),
            ("S", "🔍 Back to search", self.COLORS["DIM"]),
            ("Q", "❌ Quit", self.COLORS["DIM"]),
        ]

        for key, label, color in menu_items:
            if key:
                print(f"  {color}[{key}]{self.COLORS['RESET']} {label}")
            else:
                print()

        # Show last action result if any
        if self.last_action_result:
            print()
            print(
                f"{self.COLORS['DIM']}Last action: {self.last_action_result}{self.COLORS['RESET']}"
            )

        print()
        print("=" * 60)

        # Get choice
        choice = (
            input(f"{self.COLORS['BOLD']}Select action: {self.COLORS['RESET']}")
            .strip()
            .upper()
        )

        return choice

    def execute_action(self, action: str) -> Optional[str]:
        """Execute the selected action and return navigation command"""
        if action == "1":
            return self.copy_to_clipboard()
        elif action == "2":
            return self.copy_as_markdown()
        elif action == "3":
            return self.copy_selected()
        elif action == "4":
            return self.open_in_editor()
        elif action == "5":
            return self.show_file_path()
        elif action == "6":
            return self.extract_to_file()
        elif action == "7":
            return self.create_claude_context()
        elif action == "B":
            return "back_to_viewer"
        elif action == "S":
            return "back_to_search"
        elif action == "Q":
            return "quit"
        else:
            self.last_action_result = "❌ Invalid choice"
            return None

    def copy_to_clipboard(self) -> Optional[str]:
        """Copy full conversation to clipboard"""
        if not CLIPBOARD_AVAILABLE:
            self.last_action_result = "❌ Clipboard not available (install pyperclip)"
            return None

        try:
            text = self.viewer.get_conversation_text()
            pyperclip.copy(text)
            self.last_action_result = "✅ Conversation copied to clipboard"
        except Exception as e:
            self.last_action_result = f"❌ Failed to copy: {e}"

        return None

    def copy_as_markdown(self) -> Optional[str]:
        """Copy conversation as markdown"""
        if not CLIPBOARD_AVAILABLE:
            self.last_action_result = "❌ Clipboard not available (install pyperclip)"
            return None

        try:
            markdown = self.viewer.get_conversation_markdown()
            pyperclip.copy(markdown)
            self.last_action_result = "✅ Markdown copied to clipboard"
        except Exception as e:
            self.last_action_result = f"❌ Failed to copy: {e}"

        return None

    def copy_selected(self) -> Optional[str]:
        """Copy selected portion of conversation"""
        # This would need additional UI for selecting portions
        # For now, copy visible viewport
        if not CLIPBOARD_AVAILABLE:
            self.last_action_result = "❌ Clipboard not available (install pyperclip)"
            return None

        try:
            # Get visible lines
            start = self.viewer.state.current_line
            end = min(
                start + self.viewer.state.viewport_height,
                len(self.viewer.formatted_lines),
            )

            visible_lines = []
            for i in range(start, end):
                if i < len(self.viewer.formatted_lines):
                    # Strip ANSI codes
                    import re

                    line = re.sub(r"\033\[[0-9;]*m", "", self.viewer.formatted_lines[i])
                    visible_lines.append(line)

            text = "\n".join(visible_lines)
            pyperclip.copy(text)
            self.last_action_result = "✅ Visible section copied to clipboard"
        except Exception as e:
            self.last_action_result = f"❌ Failed to copy: {e}"

        return None

    def open_in_editor(self) -> Optional[str]:
        """Open conversation in system editor"""
        try:
            # Create temporary file with conversation
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".md", delete=False, prefix="claude_conversation_"
            ) as f:
                f.write(self.viewer.get_conversation_markdown())
                temp_path = f.name

            # Open in appropriate editor
            if platform.system() == "Windows":
                os.startfile(temp_path)
            elif platform.system() == "Darwin":  # macOS
                subprocess.run(["open", temp_path])
            else:  # Linux/Unix
                # Try common editors
                for editor in ["xdg-open", "gedit", "nano", "vim"]:
                    try:
                        subprocess.run([editor, temp_path])
                        break
                    except FileNotFoundError:
                        continue

            self.last_action_result = f"✅ Opened in editor: {temp_path}"
        except Exception as e:
            self.last_action_result = f"❌ Failed to open editor: {e}"

        return None

    def show_file_path(self) -> Optional[str]:
        """Show and copy file path"""
        path_str = str(self.viewer.jsonl_path.absolute())

        if CLIPBOARD_AVAILABLE:
            try:
                pyperclip.copy(path_str)
                self.last_action_result = f"✅ Path copied: {path_str}"
            except Exception:
                self.last_action_result = f"📁 Path: {path_str}"
        else:
            self.last_action_result = f"📁 Path: {path_str}"

        return None

    def extract_to_file(self) -> Optional[str]:
        """Extract conversation to file"""
        try:
            # Get output directory
            output_dir = Path.home() / "Desktop" / "Claude Conversations"
            output_dir.mkdir(parents=True, exist_ok=True)

            # Generate filename
            from datetime import datetime

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"conversation_{timestamp}.md"
            output_path = output_dir / filename

            # Write file
            output_path.write_text(self.viewer.get_conversation_markdown())

            self.last_action_result = f"✅ Extracted to: {output_path}"

            # Optionally open folder
            if platform.system() == "Windows":
                os.startfile(str(output_dir))
            elif platform.system() == "Darwin":
                subprocess.run(["open", str(output_dir)])
        except Exception as e:
            self.last_action_result = f"❌ Failed to extract: {e}"

        return None

    def create_claude_context(self) -> Optional[str]:
        """Create context file for Claude Code"""
        try:
            # Create context directory
            context_dir = Path.home() / ".claude" / "context"
            context_dir.mkdir(parents=True, exist_ok=True)

            # Generate unique context file
            context_id = str(uuid4())[:8]
            context_file = context_dir / f"context_{context_id}.md"

            # Write context with metadata
            content = [
                "# Claude Code Context File",
                f"Generated from: {self.viewer.jsonl_path.name}",
                f"Project: {self.viewer.jsonl_path.parent.name}",
                "",
                "## Instructions",
                "This conversation provides context for a new Claude Code session.",
                "Please review the conversation below and help continue or improve upon it.",
                "",
                "---",
                "",
                self.viewer.get_conversation_markdown(),
            ]

            context_file.write_text("\n".join(content))

            # Try to launch Claude Code
            try:
                # Check if claude CLI is available
                result = subprocess.run(
                    ["which", "claude"], capture_output=True, text=True
                )

                if result.returncode == 0:
                    # Claude CLI is available
                    subprocess.run(["claude", "code", "--context", str(context_file)])
                    self.last_action_result = "✅ Opened in Claude Code with context"
                else:
                    # Claude CLI not found
                    if CLIPBOARD_AVAILABLE:
                        pyperclip.copy(str(context_file))
                        self.last_action_result = (
                            f"✅ Context file created and path copied:\n"
                            f"   {context_file}\n"
                            f"   Open Claude Code and reference this file"
                        )
                    else:
                        self.last_action_result = (
                            f"✅ Context file created:\n"
                            f"   {context_file}\n"
                            f"   Open Claude Code and reference this file"
                        )
            except Exception:
                # Fallback if Claude CLI check fails
                self.last_action_result = (
                    f"✅ Context file created:\n"
                    f"   {context_file}\n"
                    f"   Open Claude Code and reference this file"
                )

        except Exception as e:
            self.last_action_result = f"❌ Failed to create context: {e}"

        return None

    def run(self) -> str:
        """Run the action menu loop"""
        while True:
            choice = self.display_menu()
            result = self.execute_action(choice)

            if result:
                return result

            # Pause to show result
            if self.last_action_result:
                input(
                    f"\n{self.COLORS['DIM']}Press Enter to continue...{self.COLORS['RESET']}"
                )
