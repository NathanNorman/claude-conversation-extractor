"""
Enhanced Search - Complete interactive search experience

Integrates:
- Real-time search with live results
- Conversation viewer with scrolling and formatting
- Action menu for various operations
- Smooth navigation between views
"""

import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

# Import components
try:
    from ..extract_claude_logs import ClaudeConversationExtractor
    from ..realtime_search import KeyboardHandler, SearchState, TerminalDisplay
    from ..search_conversations import ConversationSearcher
    from .action_menu import ActionMenu
    from .conversation_viewer import ConversationViewer
except ImportError:
    # Direct imports for standalone execution
    sys.path.append(str(Path(__file__).parent.parent))
    from extract_claude_logs import ClaudeConversationExtractor
    from realtime_search import KeyboardHandler, SearchState, TerminalDisplay
    from search_conversations import ConversationSearcher
    from interactive_search.action_menu import ActionMenu
    from interactive_search.conversation_viewer import ConversationViewer


@dataclass
class NavigationState:
    """Maintains navigation history and current view"""

    current_view: str = "search"  # search, viewer, actions
    history: List[str] = None
    selected_file: Optional[Path] = None
    viewer: Optional[ConversationViewer] = None

    def __post_init__(self):
        if self.history is None:
            self.history = ["search"]

    def push_view(self, view: str):
        """Add view to navigation history"""
        self.history.append(view)
        self.current_view = view

    def pop_view(self) -> str:
        """Go back to previous view"""
        if len(self.history) > 1:
            self.history.pop()
            self.current_view = self.history[-1]
        return self.current_view


class EnhancedSearch:
    """Complete enhanced search experience with viewer integration"""

    def __init__(self, searcher=None, extractor=None):
        """Initialize enhanced search"""
        # Initialize components if not provided
        if searcher is None:
            searcher = ConversationSearcher()
        if extractor is None:
            extractor = ClaudeConversationExtractor()

        self.searcher = searcher
        self.extractor = extractor
        self.display = TerminalDisplay()
        self.search_state = SearchState()
        self.nav_state = NavigationState()

        # Threading for search
        self.search_thread = None
        self.search_lock = threading.Lock()
        self.results_cache = {}
        self.debounce_delay = 0.3
        self.stop_event = threading.Event()

        # Enhanced display settings
        self.show_preview = True
        self.preview_lines = 3

    def _draw_enhanced_results(self):
        """Draw search results with enhanced information"""
        # Clear previous results
        for i in range(self.display.last_result_count + self.preview_lines + 2):
            self.display.move_cursor(self.display.header_lines + i + 1, 1)
            self.display.clear_line()

        if not self.search_state.results:
            self.display.move_cursor(self.display.header_lines + 1, 1)
            if self.search_state.query:
                print(f"No results found for '{self.search_state.query}'")
            else:
                print("Start typing to search...")
        else:
            # Display enhanced results
            max_results = min(10, len(self.search_state.results))

            for i, result in enumerate(self.search_state.results[:max_results]):
                self.display.move_cursor(self.display.header_lines + i * 2 + 1, 1)

                # Selection indicator
                if i == self.search_state.selected_index:
                    print("▸ ", end="")
                    selected_color = "\033[1m"  # Bold
                else:
                    print("  ", end="")
                    selected_color = ""

                # Enhanced result display
                date_str = (
                    result.timestamp.strftime("%Y-%m-%d %H:%M")
                    if result.timestamp
                    else "Unknown"
                )
                project = Path(result.file_path).parent.name[:20]

                # Main info line
                print(
                    f"{selected_color}📄 {date_str} | {project} | {result.relevance_score:.0%} match\033[0m"
                )

                # Context preview on next line
                if i == self.search_state.selected_index and self.show_preview:
                    self.display.move_cursor(self.display.header_lines + i * 2 + 2, 4)
                    preview = result.context[:80].replace("\n", " ")
                    print(f"\033[2m{preview}...\033[0m")

        self.display.last_result_count = (
            max_results * 2 if self.show_preview else max_results
        )

    def _process_search_request(self):
        """Process a single search request"""
        with self.search_lock:
            if not self.search_state.is_searching:
                return False

            # Check debounce
            if time.time() - self.search_state.last_update < self.debounce_delay:
                return False

            query = self.search_state.query
            self.search_state.is_searching = False

        if not query:
            with self.search_lock:
                self.search_state.results = []
            return True

        # Check cache
        if query in self.results_cache:
            with self.search_lock:
                self.search_state.results = self.results_cache[query]
            return True

        # Perform enhanced search
        try:
            results = self.searcher.search(
                query=query, mode="smart", max_results=20, case_sensitive=False
            )

            # Cache results
            self.results_cache[query] = results

            with self.search_lock:
                self.search_state.results = results
                self.search_state.selected_index = 0
        except Exception as e:
            print(f"Search error: {e}")
            with self.search_lock:
                self.search_state.results = []

        return True

    def search_worker(self):
        """Background thread for searching"""
        while not self.stop_event.is_set():
            time.sleep(0.05)
            if self._process_search_request():
                # Trigger redraw if in search view
                if self.nav_state.current_view == "search":
                    pass  # Will be handled by main loop

    def trigger_search(self):
        """Trigger a new search with debouncing"""
        with self.search_lock:
            self.search_state.last_update = time.time()
            self.search_state.is_searching = True
            # Clear cache for partial matches
            keys_to_remove = [
                k
                for k in self.results_cache.keys()
                if not k.startswith(self.search_state.query)
            ]
            for k in keys_to_remove:
                del self.results_cache[k]

    def handle_search_input(self, key: str) -> Optional[str]:
        """Handle keyboard input in search view"""
        if not key:
            return None

        if key == "ESC":
            return "exit"

        elif key == "ENTER":
            if (
                self.search_state.results
                and 0
                <= self.search_state.selected_index
                < len(self.search_state.results)
            ):
                # Open conversation viewer
                selected_result = self.search_state.results[
                    self.search_state.selected_index
                ]
                return self.open_conversation(selected_result.file_path)

        elif key == "TAB":
            # Toggle preview
            self.show_preview = not self.show_preview
            return "redraw"

        elif key == "UP":
            if self.search_state.results:
                self.search_state.selected_index = max(
                    0, self.search_state.selected_index - 1
                )
                return "redraw"

        elif key == "DOWN":
            if self.search_state.results:
                max_index = min(9, len(self.search_state.results) - 1)
                self.search_state.selected_index = min(
                    max_index, self.search_state.selected_index + 1
                )
                return "redraw"

        elif key == "LEFT":
            self.search_state.cursor_pos = max(0, self.search_state.cursor_pos - 1)
            return "redraw"

        elif key == "RIGHT":
            self.search_state.cursor_pos = min(
                len(self.search_state.query), self.search_state.cursor_pos + 1
            )
            return "redraw"

        elif key == "BACKSPACE":
            if self.search_state.cursor_pos > 0:
                self.search_state.query = (
                    self.search_state.query[: self.search_state.cursor_pos - 1]
                    + self.search_state.query[self.search_state.cursor_pos :]
                )
                self.search_state.cursor_pos -= 1
                self.trigger_search()
                return "redraw"

        elif key and len(key) == 1 and ord(key) >= 32 and ord(key) < 127:
            # Printable character
            self.search_state.query = (
                self.search_state.query[: self.search_state.cursor_pos]
                + key
                + self.search_state.query[self.search_state.cursor_pos :]
            )
            self.search_state.cursor_pos += 1
            self.trigger_search()
            return "redraw"

        return None

    def open_conversation(self, file_path: Path) -> str:
        """Open a conversation in the viewer"""
        try:
            # Create viewer for the conversation
            self.nav_state.viewer = ConversationViewer(Path(file_path))
            self.nav_state.selected_file = Path(file_path)
            self.nav_state.push_view("viewer")
            return "viewer"
        except Exception as e:
            print(f"Error opening conversation: {e}")
            return "redraw"

    def handle_viewer_input(self, key: str) -> Optional[str]:
        """Handle keyboard input in viewer"""
        if not self.nav_state.viewer:
            return "search"

        viewer = self.nav_state.viewer

        if key == "q" or key == "ESC":
            # Back to search
            self.nav_state.pop_view()
            return "search"

        elif key == "a":
            # Open action menu
            self.nav_state.push_view("actions")
            return "actions"

        elif key == "j" or key == "DOWN":
            viewer.scroll_down()
            return "redraw"

        elif key == "k" or key == "UP":
            viewer.scroll_up()
            return "redraw"

        elif key == "g":
            viewer.go_to_top()
            return "redraw"

        elif key == "G":
            viewer.go_to_bottom()
            return "redraw"

        elif key == " ":
            viewer.page_down()
            return "redraw"

        elif key == "b":
            viewer.page_up()
            return "redraw"

        elif key == "/":
            # Search within conversation
            print("\033[999;1H")  # Move to bottom
            query = input("Search in conversation: ")
            if query:
                viewer.search(query)
            return "redraw"

        elif key == "n":
            viewer.next_search_result()
            return "redraw"

        elif key == "N":
            viewer.prev_search_result()
            return "redraw"

        return None

    def run(self) -> Optional[Path]:
        """Run the enhanced search interface"""
        print("🚀 Enhanced search starting...")

        # Start search worker thread
        self.search_thread = threading.Thread(target=self.search_worker, daemon=True)
        self.search_thread.start()
        print("🧵 Search worker thread started")

        try:
            print("⌨️  Initializing keyboard handler...")
            with KeyboardHandler() as keyboard:
                print("✅ Keyboard handler initialized, entering main loop")
                while True:
                    # Draw based on current view
                    if self.nav_state.current_view == "search":
                        self.display.clear_screen()
                        self.display.draw_header()
                        self._draw_enhanced_results()
                        self.display.draw_search_box(
                            self.search_state.query, self.search_state.cursor_pos
                        )

                        # Handle search input
                        key = keyboard.get_key(timeout=0.1)
                        if key:
                            action = self.handle_search_input(key)
                            if action == "exit":
                                return None
                            elif action == "viewer":
                                continue  # Will redraw viewer

                    elif self.nav_state.current_view == "viewer":
                        if self.nav_state.viewer:
                            self.nav_state.viewer.draw()

                            # Handle viewer input
                            key = keyboard.get_key(timeout=0.1)
                            if key:
                                action = self.handle_viewer_input(key)
                                if action == "search":
                                    self.nav_state.current_view = "search"
                                    continue
                                elif action == "actions":
                                    # Run action menu
                                    action_menu = ActionMenu(self.nav_state.viewer)
                                    result = action_menu.run()

                                    if result == "back_to_viewer":
                                        self.nav_state.current_view = "viewer"
                                    elif result == "back_to_search":
                                        self.nav_state.current_view = "search"
                                    elif result == "quit":
                                        return None
                        else:
                            self.nav_state.current_view = "search"

        except KeyboardInterrupt:
            return None
        finally:
            # Clean up
            self.stop_event.set()
            if self.search_thread and self.search_thread.is_alive():
                self.search_thread.join(timeout=0.5)
            self.display.clear_screen()

            # Return selected file if any
            return self.nav_state.selected_file


def main():
    """Main entry point for enhanced search"""
    # Initialize components
    extractor = ClaudeConversationExtractor()
    searcher = ConversationSearcher()

    # Create and run enhanced search
    enhanced = EnhancedSearch(searcher, extractor)
    selected_file = enhanced.run()

    if selected_file:
        print(f"\n✅ Last viewed: {selected_file}")
    else:
        print("\n👋 Search cancelled")


if __name__ == "__main__":
    main()
