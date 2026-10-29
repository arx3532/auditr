import asyncio
import sys

if sys.platform == "win32":  # psycopg's async mode needs the selector event loop
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
