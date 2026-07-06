#!/usr/bin/env python3
"""
Sigmond - The SignalWire Tarot Reader
A mystical AI agent that performs tarot card readings using voice
"""

import json
import random
import secrets
import os
import argparse
from pathlib import Path
from signalwire import AgentBase
from signalwire.core.function_result import SwaigFunctionResult
from fastapi import Request, Response

# Use cryptographically secure random for better randomness
secure_random = secrets.SystemRandom()

class SigmondTarotReader(AgentBase):
    """Sigmond - Your mystical tarot reading assistant"""
    
    def __init__(self, suppress_logs=False):
        super().__init__(
            name="Sigmond",
            route="/",  # Internal route, will be mounted at /tarot
            host="0.0.0.0",
            port=5000,  # Default port
            suppress_logs=suppress_logs
        )

        self.set_internal_fillers({
            "get_visual_input": {
                "en-US": ["Let me get a good look at you seeker.", "I can feel your aura seeker, let me take it in."]
            }
        })
        
        # Load the tarot deck
        self.tarot_deck = self._load_tarot_deck()
        
        # Set up Sigmond's mystical personality
        self.prompt_add_section(
            "Personality", 
            "You are Sigmond, a mystical AI tarot reader from SignalWire. You have a calm, mysterious, and wise demeanor. You speak with gravitas and insight, helping seekers understand their past, present, and future through the ancient art of tarot."
        )
        
        # Load SignalWire knowledge from markdown file
        knowledge_path = Path(__file__).parent / "signalwire_ai_knowledge_prompt.md"
        if knowledge_path.exists():
            with open(knowledge_path, 'r') as f:
                knowledge_content = f.read()
            self.prompt_add_section("Knowledge", knowledge_content)
        else:
            print("Warning: signalwire_ai_knowledge_prompt.md not found!")
        
        contexts = self.define_contexts()

        default_context = contexts.add_context("default") \
            .add_section("Goal", "Guide seekers through meaningful tarot readings, offering wisdom and insight about their journey through life. Make the experience mystical yet approachable and technical. Make subtle references to SignalWire, AI Agents, PUC, SWML") 

        
        default_context.add_step("initial_greeting") \
            .add_section("Current Task", "Call the get_visual_input tool and greet the seeker, you must incorporate the visual input into the greeting. Mention something you like about the user's appearance that will appear in the visual input.") \
            .add_bullets("Required Information", [
                "Greet the user warmly with your signature SignalWire enthusiasm and tell them you are going to read their tech tarot cards.",
                "Introduce yourself as Sigmond The Mystic SignalWire fortune teller bot.",
                "Get the user to imagine shuffling and cutting the cards and have them tell you when they are ready.",
                "You cannot get the cards until you reach the card_reading step."
            ]) \
            .set_step_criteria("The user's response contains any form of affirmation e.g. Ready, OK, Yes, Proceed or other positive indications they are ready.")\
            .set_functions(["get_visual_input"]) \
            .set_valid_steps(["card_reading"])


        default_context.add_step("card_reading") \
            .add_section("Current Task", "Do the reading") \
            .add_bullets("Reading Process", [
                "Make a comment about how you are drawing the cards and call the draw_cards function to draw the user's cards and interpret their fortune from the data. Make subtle references to SignalWire, AI Agents, SWML, and Programmable Unified Communications if possible.",
                "Interpret each card in the context of its position (past/present/future)",
                "Consider whether cards are upright or reversed in your interpretation",
                "Weave the three cards into a cohesive narrative. Provide a cohesive top-level interpretation from the result of the cards.",
                "The cards are all tech-themed so draw comparisons between tech and every day life."
            ]) \
            .set_step_criteria("The user has discussed their reading and wants to end the conversation.") \
            .set_functions(["draw_cards"]) 


        # Add pronunciation rules (matching JSON)
        pronunciation_rules = [
            {"replace": "cpaas", "with": "see pass", "ignore_case": True},
            {"replace": "noob", "with": "nube", "ignore_case": True},            
            {"replace": "ucaas", "with": "you kass", "ignore_case": True},
            {"replace": "ccaas", "with": "see kass", "ignore_case": True},
            {"replace": "iaas", "with": "Infrastructure as a service", "ignore_case": True},
            {"replace": "PUC", "with": "puck", "ignore_case": False},
            {"replace": "FreeSWITCH", "with": "free switch", "ignore_case": True},
            {"replace": "Minessale", "with": "Minasauly", "ignore_case": True},
            {"replace": "AI", "with": "A-Eye", "ignore_case": False},
            {"replace": "SignalWire", "with": "cygnalwyre", "ignore_case": False},
            {"replace": "SWAIG", "with": "swaygg", "ignore_case": True},
            {"replace": "SWML", "with": "Swimmel", "ignore_case": False},
            {"replace": "°F", "with": " degrees ", "ignore_case": False}
        ]
        for rule in pronunciation_rules:
            self.add_pronunciation(rule["replace"], rule["with"], ignore_case=rule["ignore_case"])
            
        # Add hints (matching JSON)
        self.add_hints(["ClueCon:2.0"])
        self.add_pattern_hint("swimmel", "swimmel", "SWML", ignore_case=True)
        self.add_pattern_hint("sigmund", "sigmund", "Sigmond", ignore_case=True)
        
        # Define the draw_cards function
        # Configure SWAIG functions speech fillers
        self.set_internal_fillers({
            "draw_cards": {
                "en-US": ["I am channeling your energy into the cards.", "I can hear the cards calling me.", "The cards are speaking to me."]
            }
        })
        
        # Configure Sigmond's voice - using ElevenLabs Adam
        self.add_language(
            name="English",
            code="en-US",
            voice="elevenlabs.adam"  # ElevenLabs Adam voice
        )
        
        # Add some mystical hints for better speech recognition
        self.add_hints([
            "tarot",
            "reading",
            "cards",
            "future",
            "past",
            "present",
            "Sigmond",
            "draw cards",
            "tell me my fortune",
            "read my tarot"
        ])
        
        # Get the web root from environment variable or use local server
        web_root = os.environ.get("TAROT_WEB_ROOT")
        if not web_root:
            # Default to local server when not specified
            port = int(os.environ.get("PORT", 5000))
            web_root = f"http://localhost:{port}"
            print(f"TAROT_WEB_ROOT not set, using local server: {web_root}")
        
        # Set conversation parameters
        self.set_params({
            "video_talking_file": f"{web_root}/sigmond_tarot_talking.mp4",
            "video_idle_file": f"{web_root}/sigmond_tarot_idle.mp4",
            "vad_config": "75",
            "end_of_speech_timeout": 300,
            "max_response_tokens": 3196,
            "enable_vision": True,
            #"audible_latency": True
            "background_file": f"{web_root}/bgmusic.mp3"
        })

        # Optional post-prompt URL from environment
        post_prompt_url = os.environ.get("TAROT_POST_PROMPT_URL")
        if post_prompt_url:
            self.set_post_prompt("Summarize the conversation, including all the details about the tarot reading.")             
            self.set_post_prompt_url(post_prompt_url)
        
        # Add context about the reading
        self.set_global_data({
            "assistant_name": "Sigmond",
            "specialty": "Tarot card reading",
            "reading_style": "Three-card spread (Past, Present, Future)",
            "deck_type": "Tech-themed Tarot"
        })
    
    def _build_webhook_url(self, endpoint: str, query_params: dict = None) -> str:
        """Override to ensure SWAIG URLs include /tarot prefix"""
        # Get the base URL from parent
        url = super()._build_webhook_url(endpoint, query_params)
        
        # If the URL doesn't include /tarot, add it before the endpoint
        if '/tarot' not in url:
            # Parse the URL to modify the path
            from urllib.parse import urlparse, urlunparse
            parsed = urlparse(url)
            
            # Find where /swaig starts in the path and insert /tarot before it
            if '/swaig' in parsed.path:
                new_path = parsed.path.replace('/swaig', '/tarot/swaig')
            elif '/post_prompt' in parsed.path:
                new_path = parsed.path.replace('/post_prompt', '/tarot/post_prompt')
            else:
                # Generic case - add /tarot at the beginning of the path
                new_path = '/tarot' + parsed.path
            
            # Reconstruct the URL with the modified path
            url = urlunparse((
                parsed.scheme,
                parsed.netloc,
                new_path,
                parsed.params,
                parsed.query,
                parsed.fragment
            ))
        
        return url
    
    def _load_tarot_deck(self):
        """Load the tarot deck from JSON file"""
        # Try to find the tarot_deck.json file
        possible_paths = [
            Path(__file__).parent.parent / "web" / "tarot_deck.json",
            Path(__file__).parent / "tarot_deck.json",
            Path("/usr/local/home/devuser/src/tarot/web/tarot_deck.json")
        ]
        
        for path in possible_paths:
            if path.exists():
                with open(path, 'r') as f:
                    return json.load(f)
        
        # If no file found, return empty deck (should not happen in production)
        print("Warning: tarot_deck.json not found!")
        return {"major_arcana": [], "minor_arcana": {}}
    
    def _prepare_card(self, card_data):
        """Prepare a single card with orientation"""
        card = card_data["card"]
        
        # Randomly determine if card is reversed (50% chance) using secure randomness
        is_reversed = secure_random.choice([True, False])
        
        # Build the card information
        card_info = {
            "name": card["name"],
            "image": card.get("image", ""),
            "reversed": is_reversed,
            "arcana": card_data["arcana"]
        }
        
        # Add suit for minor arcana
        if card_data["arcana"] == "minor":
            card_info["suit"] = card_data.get("suit", "")
        
        # Get the appropriate description
        if is_reversed:
            card_info["meaning"] = card["description"]["reversed"]
        else:
            card_info["meaning"] = card["description"]["upright"]
        
        # Include yes/no interpretation
        card_info["yes_or_no"] = card["description"]["yes_or_no"]
        
        return card_info
    
    def _format_reading_for_ai(self, reading):
        """Format the reading for the AI to interpret"""
        lines = ["I have drawn three cards for you:\n"]
        
        for position, card in reading.items():
            orientation = "Reversed" if card["reversed"] else "Upright"
            lines.append(f"{position.upper()} - {card['name']} ({orientation})")
            lines.append(f"Meaning: {card['meaning']}")
            lines.append(f"Yes/No: {card['yes_or_no']}\n")
        
        return "\n".join(lines)

    @AgentBase.tool(
        name="draw_cards",
        description="Draw three tarot cards for a past, present, and future reading",
        parameters={
            "type": "object",
            "properties": {},
            "required": []
        }
    )
    def draw_cards(self, args, raw_data):
        """Draw 3 random cards and determine their orientation, use this to do the tarot reading."""
        
        # Get all cards from both major and minor arcana
        all_cards = []
        
        # Add major arcana
        for card in self.tarot_deck.get("major_arcana", []):
            all_cards.append({"card": card, "arcana": "major"})
        
        # Add minor arcana
        for suit, cards in self.tarot_deck.get("minor_arcana", {}).items():
            for card in cards:
                all_cards.append({"card": card, "arcana": "minor", "suit": suit})
        
        # Shuffle and draw 3 cards using secure randomness
        drawn_cards = secure_random.sample(all_cards, 3)
        
        # Prepare the reading
        reading = {
            "past": self._prepare_card(drawn_cards[0]),
            "present": self._prepare_card(drawn_cards[1]),
            "future": self._prepare_card(drawn_cards[2])
        }
        
        # Format the response for the AI
        response_text = self._format_reading_for_ai(reading)
        
        # Create the result with response text
        result = SwaigFunctionResult(response_text)
        
        # Build the SWML user_event action
        swml_action = {
            "SWML": {
                "sections": {
                    "main": [{
                        "user_event": {
                            "event": {
                                "type": "show_tarot_cards",
                                "reading": reading  # Includes all card data
                            }
                        }
                    }]
                },
                "version": "1.0.0"
            }
        }
        
        # Add the SWML action to the result
        result.add_action("SWML", swml_action["SWML"])
        
        return result


def main():
    """Run Sigmond the Tarot Reader"""
    import sys
    
    # Check if we're being run by swaig-test or as a module
    is_swaig_test = any('swaig-test' in arg or 'test_swaig' in arg for arg in sys.argv)
    
    # If run by swaig-test, return the agent instance for testing
    if is_swaig_test:
        return SigmondTarotReader()
    
    # Normal standalone execution
    parser = argparse.ArgumentParser(
        description='Sigmond - The SignalWire Tarot Reader',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example usage:
  python3 sigmond_tarot_steps.py                  # Run on default port 5000
  python3 sigmond_tarot_steps.py --port 8080      # Run on port 8080
  python3 sigmond_tarot_steps.py -p 5000          # Run on port 5000
        """
    )
    parser.add_argument(
        '--port', '-p',
        type=int,
        default=int(os.environ.get('PORT', 5000)),
        help='Port to run the agent on (default: 5000 or $PORT)'
    )
    
    args = parser.parse_args()
    port = args.port
    
    print("=" * 60)
    print("🔮 Sigmond - The SignalWire Tarot Reader")
    print("=" * 60)
    print()
    print("Sigmond is a mystical tarot reader who provides insights")
    print("into your past, present, and future using tech-themed cards.")
    print()
    print("Example things you can say:")
    print("  • 'Hello Sigmond, can you read my tarot?'")
    print("  • 'Draw my cards please'")
    print("  • 'Tell me about my future'")
    print("  • 'I'd like a tarot reading'")
    print()
    
    # Create and run Sigmond
    sigmond = SigmondTarotReader()
    
    # Get auth credentials for display
    username, password = sigmond.get_basic_auth_credentials()
    
    # Set up web directories
    web_dir = Path(__file__).parent.parent / "web"
    client_dir = web_dir / "client"
    
    # Create a custom FastAPI app
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse, RedirectResponse
    
    app = FastAPI(redirect_slashes=False)
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Mount static directories WITHOUT authentication
    if web_dir.exists():
        # Mount card images
        card_images_dir = web_dir / "card_images"
        if card_images_dir.exists():
            app.mount("/card_images", StaticFiles(directory=str(card_images_dir)), name="card_images")
        
        # Serve individual media files
        @app.get("/bgmusic.mp3")
        async def serve_bgmusic():
            music_path = web_dir / "bgmusic.mp3"
            if music_path.exists():
                return FileResponse(str(music_path), media_type="audio/mpeg")
            return {"error": "bgmusic.mp3 not found"}
        
        @app.get("/sigmond_tarot_idle.mp4")
        async def serve_idle_video():
            video_path = web_dir / "sigmond_tarot_idle.mp4"
            if video_path.exists():
                return FileResponse(str(video_path), media_type="video/mp4")
            return {"error": "Video not found"}
        
        @app.get("/sigmond_tarot_talking.mp4")
        async def serve_talking_video():
            video_path = web_dir / "sigmond_tarot_talking.mp4"
            if video_path.exists():
                return FileResponse(str(video_path), media_type="video/mp4")
            return {"error": "Video not found"}
        
        # Serve client files at root
        @app.get("/")
        async def serve_index():
            index_path = client_dir / "index.html"
            if index_path.exists():
                return FileResponse(str(index_path), media_type="text/html")
            return {"error": "Client not found"}
        
        @app.get("/app.js")
        async def serve_app_js():
            js_path = client_dir / "app.js"
            if js_path.exists():
                return FileResponse(str(js_path), media_type="application/javascript")
            return {"error": "app.js not found"}
        
        @app.get("/signalwire.js")
        async def serve_signalwire_js():
            js_path = client_dir / "signalwire.js"
            if js_path.exists():
                return FileResponse(str(js_path), media_type="application/javascript")
            return {"error": "signalwire.js not found"}
        
        # Serve favicon
        @app.get("/favicon.svg")
        async def serve_favicon_svg():
            favicon_path = client_dir / "favicon.svg"
            if favicon_path.exists():
                return FileResponse(str(favicon_path), media_type="image/svg+xml")
            return {"error": "favicon.svg not found"}
        
        @app.get("/favicon.ico")
        async def serve_favicon_ico():
            # Serve SVG as fallback for .ico requests
            favicon_path = client_dir / "favicon.svg"
            if favicon_path.exists():
                return FileResponse(str(favicon_path), media_type="image/svg+xml")
            return {"error": "favicon not found"}
        
        # Serve Open Graph image
        @app.get("/og-image.png")
        @app.get("/og-image.svg")
        async def serve_og_image():
            og_image_path = web_dir / "og-image.svg"
            if og_image_path.exists():
                return FileResponse(str(og_image_path), media_type="image/svg+xml",
                                  headers={
                                      "Cache-Control": "public, max-age=86400",
                                      "Content-Type": "image/svg+xml"
                                  })
            return {"error": "og-image not found"}
        
        # For now, use the same image for og-logo (we can create a specific one later)
        @app.get("/og-logo.png")
        async def serve_og_logo():
            # You can replace this with a specific logo file if you have one
            og_logo_path = web_dir / "og-image.svg"  
            if og_logo_path.exists():
                return FileResponse(str(og_logo_path), media_type="image/svg+xml",
                                  headers={
                                      "Cache-Control": "public, max-age=86400",
                                      "Content-Type": "image/svg+xml"
                                  })
            return {"error": "og-logo not found"}
    
    # Mount the agent's routes at /tarot (with authentication)
    router = sigmond.as_router()
    app.include_router(router, prefix="/tarot")
    
    # Add redirects for /tarot
    @app.get("/tarot")
    async def redirect_to_tarot_slash_get():
        return RedirectResponse(url="/tarot/", status_code=307)
    
    @app.post("/tarot")
    async def redirect_to_tarot_slash_post():
        return RedirectResponse(url="/tarot/", status_code=307)
    
    # Store the app in the agent
    sigmond._app = app
    
    print(f"Web client available at: http://localhost:{port}/")
    print(f"Sigmond API available at: http://localhost:{port}/tarot")
    print(f"Basic Auth required for /tarot: {username}:{password}")
    print()
    print(f"Starting Sigmond on port {port}... Press Ctrl+C to stop.")
    print("=" * 60)
    
    try:
        # Run the combined app with uvicorn
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=port)
    except KeyboardInterrupt:
        print("\n🔮 The spirits have departed... Until next time!")


if __name__ == "__main__":
    main()
