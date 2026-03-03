from google import genai
import os

# 1. Setup Client (It automatically looks for GEMINI_API_KEY in your env)
client = genai.Client(api_key="***REMOVED***")

# 2. Define your translation task
texts_to_translate = [
    "Hello, how are you today?",
    "The weather in Tokyo is quite rainy this morning.",
    "Please ensure the API key is kept secure in environment variables."
]

target_language = "German"

# 3. Simple Loop for small batches (or use client.batches for massive files)
for text in texts_to_translate:
    response = client.models.generate_content(
        model="gemini-2.0-pro",
        contents=f"Translate the following text to {target_language}. Return ONLY the translation: {text}"
    )
    print(f"Original: {text}")
    print(f"Translation: {response.text}\n")