#!/usr/bin/env python3
"""Interactive terminal UI for Claude Conversation Extractor"""

import os
import platform
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List, Optional

# Handle both package and direct execution imports
try:
    from .extract_claude_logs import ClaudeConversationExtractor
    from .realtime_search import RealTimeSearch, create_smart_searcher
    from .search_conversations import ConversationSearcher
    from .interactive_search import EnhancedSearch
except ImportError:
    # Fallback for direct execution or when not installed as package
    from extract_claude_logs import ClaudeConversationExtractor
    from realtime_search import RealTimeSearch, create_smart_searcher
    from search_conversations import ConversationSearcher

    try:
        from interactive_search import EnhancedSearch
    except ImportError:
        # EnhancedSearch may not be available in older installations
        EnhancedSearch = None


class InteractiveUI:
    """Interactive terminal UI for easier conversation extraction"""

    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = output_dir
        self.extractor = ClaudeConversationExtractor(output_dir)
        self.searcher = ConversationSearcher()
        self.sessions: List[Path] = []
        self.terminal_width = shutil.get_terminal_size().columns

    def clear_screen(self):
        """Clear the terminal screen"""
        # Use ANSI escape codes for cross-platform compatibility
        print("\033[2J\033[H", end="")

    def print_banner(self):
        """Print a cool ASCII banner"""
        # Bright magenta color
        MAGENTA = "\033[95m"
        RESET = "\033[0m"
        BOLD = "\033[1m"

        banner = f"""{MAGENTA}{BOLD}

 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
███████╗██╗  ██╗████████╗██████╗  █████╗  ██████╗████████╗
██╔════╝╚██╗██╔╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
█████╗   ╚███╔╝    ██║   ██████╔╝███████║██║        ██║
██╔══╝   ██╔██╗    ██║   ██╔══██╗██╔══██║██║        ██║
███████╗██╔╝ ██╗   ██║   ██║  ██║██║  ██║╚██████╗   ██║
╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝   ╚═╝

{RESET}"""
        print(banner)

    def print_centered(self, text: str, char: str = "="):
        """Print text centered with decorative characters"""
        padding = (self.terminal_width - len(text) - 2) // 2
        print(f"{char * padding} {text} {char * padding}")

    def get_folder_selection(self) -> Optional[Path]:
        """Simple folder selection dialog"""
        self.clear_screen()
        self.print_banner()
        print("\n📁 Where would you like to save your conversations?\n")

        # Suggest common locations with ~/.claude/claude_conversations as default
        home = Path.home()
        suggestions = [
            home / ".claude" / "claude_conversations",  # Default location
            home / "Desktop" / "claude_conversations",
            home / "Documents" / "claude_conversations",
            Path.cwd() / "claude_conversations",
        ]

        # Create menu options for folder selection
        folder_options = []
        for i, path in enumerate(suggestions):
            folder_options.append((f"{path}", str(i + 1), lambda p=path: p))

        folder_options.append(("Custom location", "C", self._handle_custom_location))
        folder_options.append(("Quit", "Q", lambda: None))

        return self._show_interactive_menu(folder_options, is_folder_menu=True)

    def show_sessions_menu(self) -> List[int]:
        """Display sessions and let user select which to extract"""
        self.clear_screen()
        self.print_banner()

        # Get all sessions
        print("\n🔍 Finding your Claude conversations...")
        self.sessions = self.extractor.find_sessions()

        if not self.sessions:
            print("\n❌ No Claude conversations found!")
            print("Make sure you've used Claude Code at least once.")
            input("\nPress Enter to exit...")
            return []

        print(f"\n✅ Found {len(self.sessions)} conversations!\n")

        # Display sessions
        for i, session_path in enumerate(self.sessions[:20], 1):  # Show max 20
            project = session_path.parent.name
            modified = datetime.fromtimestamp(session_path.stat().st_mtime)
            size_kb = session_path.stat().st_size / 1024

            date_str = modified.strftime("%Y-%m-%d %H:%M")
            print(f"  {i:2d}. [{date_str}] {project[:30]:<30} ({size_kb:.1f} KB)")

        if len(self.sessions) > 20:
            print(f"\n  ... and {len(self.sessions) - 20} more conversations")

        # Interactive menu with arrow key navigation
        menu_options = [
            ("Extract ALL conversations", "A", lambda: list(range(len(self.sessions)))),
            (
                "Extract 5 most RECENT",
                "R",
                lambda: list(range(min(5, len(self.sessions)))),
            ),
            ("SELECT specific conversations", "S", self._handle_select_specific),
            ("SEARCH conversations (enhanced search)", "F", self._handle_search),
            ("QUIT", "Q", lambda: []),
        ]

        return self._show_interactive_menu(menu_options)

    def show_progress(self, current: int, total: int, message: str = ""):
        """Display a simple progress bar"""
        bar_width = 40
        progress = current / total if total > 0 else 0
        filled = int(bar_width * progress)
        bar = "█" * filled + "░" * (bar_width - filled)

        print(f"\r[{bar}] {current}/{total} {message}", end="", flush=True)

    def _handle_custom_location(self):
        """Handle custom folder location input"""
        custom_path = input("\nEnter custom path: ").strip()
        if custom_path:
            return Path(custom_path).expanduser()
        return None

    def _show_interactive_menu(self, menu_options: List[tuple], is_folder_menu: bool = False):
        """Display interactive menu with arrow key navigation"""
        try:
            # Test if we can import terminal modules (Unix-like systems)
            import termios  # noqa: F401
            import tty  # noqa: F401
        except ImportError:
            # Fallback to simple text-based menu on Windows
            return self._show_text_menu(menu_options)

        selected_index = 0

        while True:
            # Clear previous menu and redraw
            print("\n" + "=" * 60)

            if is_folder_menu:
                print("\n📋 Choose a folder (use ↑↓ arrows, Enter to select):")
            else:
                print("\n📋 Choose an action (use ↑↓ arrows, Enter to select):")

            for i, (description, key, _) in enumerate(menu_options):
                if i == selected_index:
                    print(f"  → {key}. {description}")
                else:
                    print(f"    {key}. {description}")

            # Get key input
            key = self._get_key()

            if key == "\x1b":  # ESC sequence
                # Handle arrow keys
                key += self._get_key() + self._get_key()
                if key == "\x1b[A":  # Up arrow
                    selected_index = (selected_index - 1) % len(menu_options)
                elif key == "\x1b[B":  # Down arrow
                    selected_index = (selected_index + 1) % len(menu_options)
            elif key == "\r" or key == "\n":  # Enter
                # Execute selected option
                _, _, action = menu_options[selected_index]
                return action()
            elif key.upper() in [opt[1] for opt in menu_options]:
                # Direct key selection
                for i, (_, opt_key, action) in enumerate(menu_options):
                    if key.upper() == opt_key:
                        return action()

            # Clear screen for next iteration
            print("\033[2J\033[H", end="")
            self.print_banner()

            if is_folder_menu:
                print("\n📁 Where would you like to save your conversations?\n")
            else:
                print(f"\n✅ Found {len(self.sessions)} conversations!\n")

                # Redraw session list
                for i, session_path in enumerate(self.sessions[:20], 1):
                    project = session_path.parent.name
                    modified = datetime.fromtimestamp(session_path.stat().st_mtime)
                    size_kb = session_path.stat().st_size / 1024
                    date_str = modified.strftime("%Y-%m-%d %H:%M")
                    print(f"  {i:2d}. [{date_str}] {project[:30]:<30} ({size_kb:.1f} KB)")

                if len(self.sessions) > 20:
                    print(f"\n  ... and {len(self.sessions) - 20} more conversations")

    def _show_text_menu(self, menu_options: List[tuple]) -> List[int]:
        """Fallback text-based menu for Windows/non-terminal environments"""
        print("\n" + "=" * 60)
        print("\nOptions:")
        for description, key, _ in menu_options:
            print(f"  {key}. {description}")

        while True:
            choice = input("\nYour choice: ").strip().upper()

            for _, opt_key, action in menu_options:
                if choice == opt_key:
                    return action()

            print("❌ Invalid choice. Please try again.")

    def _get_key(self):
        """Get a single keypress"""
        import sys
        import termios
        import tty

        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setcbreak(fd)
            key = sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        return key

    def _handle_select_specific(self) -> List[int]:
        """Handle specific conversation selection"""
        selection = input("Enter conversation numbers (e.g., 1,3,5): ").strip()
        try:
            indices = [int(x.strip()) - 1 for x in selection.split(",")]
            if all(0 <= i < len(self.sessions) for i in indices):
                return indices
            else:
                print("❌ Invalid selection. Please use valid numbers.")
                return []
        except ValueError:
            print("❌ Invalid format. Use comma-separated numbers.")
            return []

    def _handle_search(self) -> List[int]:
        """Handle search conversations"""
        print("\n🔍 Launching enhanced search...")
        try:
            result = self.search_conversations()
            print(f"📊 Search returned: {result}")
            return result
        except Exception as e:
            print(f"❌ Search error: {e}")
            input("Press Enter to continue...")
            return []

    def search_conversations(self) -> List[int]:
        """Launch enhanced search interface with full interactive experience"""
        # Use EnhancedSearch if available, otherwise fall back to RealTimeSearch
        if EnhancedSearch:
            # Use the new enhanced search system
            enhanced = EnhancedSearch(self.searcher, self.extractor)
            selected_file = enhanced.run()

            # The EnhancedSearch handles all interaction internally
            # It returns the selected file if the user extracted it
            if selected_file:
                try:
                    index = self.sessions.index(Path(selected_file))
                    return [index]
                except ValueError:
                    # File may have been viewed but not extracted
                    pass
            return []
        else:
            # Fall back to basic real-time search
            smart_searcher = create_smart_searcher(self.searcher)
            rts = RealTimeSearch(smart_searcher, self.extractor)
            selected_file = rts.run()

            if selected_file:
                # View the selected conversation
                self.extractor.display_conversation(Path(selected_file))

                # Ask if user wants to extract it
                extract_choice = input("\n📤 Extract this conversation? (y/N): ").strip().lower()
                if extract_choice == "y":
                    try:
                        index = self.sessions.index(Path(selected_file))
                        return [index]
                    except ValueError:
                        print("\n❌ Error: Selected file not found in sessions list")
                        input("\nPress Enter to continue...")

                # Return empty to go back to menu
                return []

            return []

    def extract_conversations(self, indices: List[int], output_dir: Path) -> int:
        """Extract selected conversations with progress display"""
        print(f"\n📤 Extracting {len(indices)} conversations...\n")

        # Update the extractor's output directory
        self.extractor.output_dir = output_dir

        # Use the extractor's method
        success_count, total_count = self.extractor.extract_multiple(self.sessions, indices)

        print(f"\n\n✅ Successfully extracted {success_count}/{total_count} conversations!")
        return success_count

    def open_folder(self, path: Path):
        """Open the output folder in the system file explorer"""
        try:
            if platform.system() == "Windows":
                os.startfile(str(path))
            elif platform.system() == "Darwin":  # macOS
                subprocess.run(["open", str(path)])
            else:  # Linux
                subprocess.run(["xdg-open", str(path)])
        except Exception:
            pass  # Silently fail if we can't open the folder

    def run(self):
        """Main interactive UI flow"""
        try:
            # Get output folder
            output_dir = self.get_folder_selection()
            if not output_dir:
                print("\n👋 Goodbye!")
                return

            # Get session selection
            selected_indices = self.show_sessions_menu()
            if not selected_indices:
                print("\n👋 Goodbye!")
                return

            # Create output directory if needed
            output_dir.mkdir(parents=True, exist_ok=True)

            # Extract conversations
            success_count = self.extract_conversations(selected_indices, output_dir)

            if success_count > 0:
                print(f"\n📁 Files saved to: {output_dir}")

                # Offer to open the folder
                open_choice = input("\n🗂️  Open output folder? (Y/n): ").strip().lower()
                if open_choice != "n":
                    self.open_folder(output_dir)

            else:
                print("\n❌ No conversations were extracted.")

            input("\n✨ Press Enter to exit...")

        except KeyboardInterrupt:
            print("\n\n👋 Goodbye!")
        except Exception as e:
            print(f"\n❌ Error: {e}")
            input("\nPress Enter to exit...")


def main():
    """Entry point for interactive UI"""
    ui = InteractiveUI()
    ui.run()


if __name__ == "__main__":
    main()
