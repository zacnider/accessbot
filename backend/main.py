"""AccessBot Backend - FastAPI + ADK bidi-streaming server.

Handles WebSocket connections from the Chrome extension, manages ADK
streaming sessions, and bridges tool calls between Gemini and the extension.
"""

import asyncio
import base64
import json
import logging
import os
import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from agent import root_agent
from config import HOST, PORT

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AccessBot", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "accessbot"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    session_id = str(uuid.uuid4())
    user_id = f"user_{session_id[:8]}"

    logger.info(f"New WebSocket connection: session={session_id}")

    # ── Step 1: Wait for auth message with API key ──
    try:
        raw_auth = await asyncio.wait_for(
            websocket.receive_text(), timeout=15.0,
        )
        auth_msg = json.loads(raw_auth)

        if auth_msg.get("type") != "auth" or not auth_msg.get("api_key"):
            await websocket.send_json({
                "type": "error",
                "message": "API key required. Send {type:'auth', api_key:'...'} first.",
            })
            await websocket.close(code=4001, reason="API key required")
            return

        api_key = auth_msg["api_key"].strip()
        logger.info(f"API key received for session={session_id}")

    except asyncio.TimeoutError:
        await websocket.send_json({
            "type": "error",
            "message": "Auth timeout. Please provide your API key.",
        })
        await websocket.close(code=4002, reason="Auth timeout")
        return
    except Exception as auth_err:
        logger.error(f"Auth error: {auth_err}")
        await websocket.close(code=4003, reason="Auth error")
        return

    # ── Step 2: Set API key for this session ──
    os.environ["GOOGLE_API_KEY"] = api_key

    # Create per-session runner and session service
    session_service = InMemorySessionService()
    runner = Runner(
        app_name="accessbot",
        agent=root_agent,
        session_service=session_service,
    )

    # Create ADK session
    session = await session_service.create_session(
        app_name="accessbot",
        user_id=user_id,
    )

    # Run config for bidi-streaming with audio output
    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name="Kore",
                ),
            ),
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )

    live_request_queue = LiveRequestQueue()

    # Send session info to client
    await websocket.send_json({
        "type": "session_info",
        "session_id": session_id,
    })

    async def upstream_task():
        """Receive data from Chrome extension and forward to Gemini via ADK."""
        try:
            while True:
                raw = await websocket.receive()

                if raw.get("type") == "websocket.disconnect":
                    break

                data = raw.get("text") or raw.get("bytes")
                if not data:
                    continue

                # Binary data = raw audio PCM
                if isinstance(data, bytes):
                    audio_blob = types.Blob(
                        mime_type="audio/pcm;rate=16000",
                        data=data,
                    )
                    live_request_queue.send_realtime(audio_blob)
                    continue

                # JSON messages
                msg = json.loads(data)
                msg_type = msg.get("type")

                if msg_type == "audio":
                    audio_data = base64.b64decode(msg["data"])
                    audio_blob = types.Blob(
                        mime_type="audio/pcm;rate=16000",
                        data=audio_data,
                    )
                    live_request_queue.send_realtime(audio_blob)

                elif msg_type == "screenshot":
                    image_data = base64.b64decode(msg["data"])
                    image_blob = types.Blob(
                        mime_type="image/jpeg",
                        data=image_data,
                    )
                    live_request_queue.send_realtime(image_blob)

                elif msg_type == "action_result":
                    tool_call_id = msg.get("id")
                    result = msg.get("result", {})
                    logger.info(
                        f"Action result received: {tool_call_id} "
                        f"success={result.get('success')}"
                    )

                    # Forward result to Gemini so the AI knows
                    # what actually happened after its tool call.
                    success = result.get("success", False)
                    error = result.get("error", "")

                    parts = []
                    if success:
                        detail_keys = [
                            "element", "url", "text", "tabs",
                            "switchedTo", "closedTab", "newTab",
                            "setting", "value", "page_type",
                            "suggestions", "totalTabs",
                            "page_text", "summary", "elements",
                            "structure", "newZoom", "method",
                        ]
                        details = []
                        for k in detail_keys:
                            if k in result:
                                v = result[k]
                                # Truncate long values
                                s = str(v)
                                if len(s) > 300:
                                    s = s[:300] + "..."
                                details.append(f"{k}={s}")
                        detail_str = (
                            "; ".join(details) if details
                            else "completed"
                        )
                        parts.append(
                            f"[Action Result] Success: {detail_str}"
                        )
                    else:
                        parts.append(
                            f"[Action Result] Failed: {error}"
                        )

                    try:
                        content = types.Content(
                            role="user",
                            parts=[
                                types.Part.from_text(text=p)
                                for p in parts
                            ],
                        )
                        live_request_queue.send_content(content)
                    except Exception as fwd_err:
                        logger.warning(
                            f"Could not forward action result "
                            f"to Gemini: {fwd_err}"
                        )

                elif msg_type == "keepalive":
                    pass

        except WebSocketDisconnect:
            logger.info(f"Client disconnected: session={session_id}")
        except Exception as e:
            logger.error(f"Upstream error: {e}", exc_info=True)

    async def downstream_task():
        """Receive events from ADK/Gemini and forward to Chrome extension."""
        audio_chunks_sent = 0
        turn_count = 0
        try:
            # Loop to handle Gemini session reconnection.
            # Gemini Live API has ~2 min session limit for audio+video.
            # When it expires, we catch the error and restart run_live().
            while True:
                turn_count += 1
                logger.info(
                    f"Starting run_live turn #{turn_count} "
                    f"for session={session_id}"
                )
                try:
                    async for event in runner.run_live(
                        user_id=user_id,
                        session_id=session.id,
                        live_request_queue=live_request_queue,
                        run_config=run_config,
                    ):
                        if not event:
                            continue

                        try:
                            await _process_event(
                                event, websocket, audio_chunks_sent,
                                turn_count,
                            )
                            # Track audio count from closure
                            if event.content and event.content.parts:
                                for part in event.content.parts:
                                    if (
                                        part.inline_data
                                        and part.inline_data.data
                                        and (part.inline_data.mime_type or "")
                                        .startswith("audio/")
                                    ):
                                        audio_chunks_sent += 1

                        except Exception as inner_err:
                            logger.error(
                                f"Error processing event: {inner_err}",
                                exc_info=True,
                            )

                except WebSocketDisconnect:
                    raise  # re-raise to outer handler
                except Exception as live_err:
                    # Gemini session expired (1008) or other transient error.
                    # Log and restart run_live for a new session.
                    logger.warning(
                        f"run_live() error on turn #{turn_count}: {live_err}. "
                        f"Reconnecting to Gemini..."
                    )
                    await websocket.send_json({
                        "type": "transcript",
                        "role": "model",
                        "text": "(Session yenileniyor...)",
                    })
                    await asyncio.sleep(0.5)
                    continue

                logger.info(
                    f"run_live() iterator ended for turn #{turn_count}, "
                    f"restarting..."
                )

        except WebSocketDisconnect:
            logger.info(
                f"Client disconnected during downstream: session={session_id}"
            )
        except Exception as e:
            logger.error(f"Downstream error: {e}", exc_info=True)

    async def _process_event(event, ws, audio_count, turn_num):
        """Process a single ADK event and forward relevant data to client."""
        # --- Process content parts ---
        if event.content and event.content.parts:
            for part in event.content.parts:
                # Audio data
                if part.inline_data and part.inline_data.data:
                    mime = part.inline_data.mime_type or ""
                    if mime.startswith("audio/"):
                        b64_data = base64.b64encode(
                            part.inline_data.data
                        ).decode("utf-8")
                        await ws.send_json({
                            "type": "audio",
                            "data": b64_data,
                            "mime_type": mime,
                        })
                        if audio_count % 50 == 0:
                            logger.info(
                                f"Audio chunk #{audio_count + 1}: "
                                f"{len(part.inline_data.data)} bytes"
                            )

                # Text in content
                if part.text:
                    role = (
                        event.content.role if event.content.role else "model"
                    )
                    await ws.send_json({
                        "type": "transcript",
                        "role": role,
                        "text": part.text,
                    })

                # Tool calls (function_call in parts)
                if part.function_call:
                    fc = part.function_call
                    tool_call_id = fc.id or str(uuid.uuid4())
                    function_name = fc.name or ""
                    function_args = fc.args or {}

                    result = (
                        dict(function_args)
                        if isinstance(function_args, dict)
                        else {}
                    )
                    if "action" not in result:
                        result["action"] = function_name

                    await ws.send_json({
                        "type": "action",
                        "id": tool_call_id,
                        "action": result,
                    })
                    logger.info(f"Tool call: {function_name}({function_args})")

        # --- Output transcription ---
        if event.output_transcription and event.output_transcription.text:
            await ws.send_json({
                "type": "transcript",
                "role": "model",
                "text": event.output_transcription.text,
            })

        # --- Input transcription ---
        if event.input_transcription and event.input_transcription.text:
            await ws.send_json({
                "type": "transcript",
                "role": "user",
                "text": event.input_transcription.text,
            })

        # --- Interruption ---
        if event.interrupted:
            await ws.send_json({"type": "interrupted"})

        # --- Turn complete ---
        if event.turn_complete:
            logger.info(
                f"Turn #{turn_num} complete. "
                f"Total audio chunks: {audio_count}"
            )
            await ws.send_json({"type": "turn_complete"})

    try:
        await asyncio.gather(
            upstream_task(),
            downstream_task(),
            return_exceptions=True,
        )
    finally:
        live_request_queue.close()
        logger.info(f"Session cleaned up: session={session_id}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
