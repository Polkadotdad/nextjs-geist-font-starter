import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { config } from "./config.js";

// Premade voices accepted by the TTS model's `voice` field.
export const VOICES = {
  female: ["Rachel", "Aria", "Sarah", "Laura", "Charlotte", "Alice", "Matilda", "Jessica", "Lily"],
  male: ["Roger", "Charlie", "George", "Callum", "Liam", "Will", "Eric", "Chris", "Brian", "Daniel", "Bill"],
} as const;
const ALL_VOICES = [...VOICES.female, ...VOICES.male] as [string, ...string[]];

export const ScriptSchema = z.object({
  allowed: z.boolean().describe("false if the request breaks the content rules"),
  rejectionReason: z.string().describe("Short, friendly reason shown to the user when allowed is false, else empty"),
  title: z.string().describe("Short title in the target language"),
  caption: z.string().describe("Punchy on-screen caption in the target language, max 60 characters, may end with one emoji"),
  setting: z.string().describe("English. The main location and its look, for the illustrator"),
  characters: z
    .array(
      z.object({
        id: z.string().describe("Short lowercase id, e.g. teacher"),
        name: z.string().describe("Display name in the target language"),
        look: z.string().describe("English. Age, body shape, hair, clothes, colours, one funny distinguishing feature"),
        voice: z.enum(ALL_VOICES),
      }),
    )
    .describe("1 to 3 original characters"),
  scenes: z.array(
    z.object({
      visual: z.string().describe("English. One vertical shot: who is in frame, pose, facial expression, background"),
      motion: z.string().describe("English. What moves during the 5 second shot, simple and physical"),
      speakerId: z.string().describe("id of the character who speaks, or empty for no dialogue"),
      line: z.string().describe("Spoken line in the target language, max 18 words, or empty"),
    }),
  ),
});

export type Script = z.infer<typeof ScriptSchema>;

const SYSTEM_PROMPT = `You write scripts for very short animated comedy reels (vertical 9:16, flat 2D cartoon style, like popular Instagram cartoon pages).
Each reel is a handful of 5-second shots with one spoken line per shot, building to a punchline in the final shot.

Rules:
- Invent original characters. Never use real people, celebrities, politicians, or characters/brands owned by others, even if asked; make an original look-alike-free character instead.
- Keep it light: no sexual content, no content involving minors in unsafe situations, no hate, harassment of real people, graphic violence, self-harm, or dangerous instructions. Slapstick and everyday humour are fine.
- If the request can't be made within these rules, set allowed=false with a short friendly rejectionReason and fill the other fields minimally.
- Dialogue, title, caption and character names are in the target language, written in its usual script, in natural everyday speech (e.g. casual Hinglish-style Hindi is fine for Hindi).
- Visual fields are always in English and must be concrete enough for an illustrator: the same characters must look identical in every shot.
- Match the culture of the setting to the user's prompt and language.
- Pick each character's voice from the allowed list to suit their gender and age; different characters get different voices.`;

const client = config.anthropicConfigured ? new Anthropic() : null;

export async function writeScript(prompt: string, languageName: string, sceneCount: number): Promise<Script> {
  if (!client) return mockScript(prompt, sceneCount);

  const response = await client.beta.messages.parse({
    model: config.claudeModel,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ScriptSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Target language: ${languageName}\nNumber of shots: exactly ${sceneCount}\n\nReel idea from the user:\n${prompt}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return { ...mockScript(prompt, 0), allowed: false, rejectionReason: "This idea can't be made into a video. Try a different one." };
  }
  const script = response.parsed_output;
  if (!script) throw new Error("The script writer returned an unreadable script");
  if (script.allowed && script.scenes.length === 0) throw new Error("The script has no scenes");
  return { ...script, scenes: script.scenes.slice(0, sceneCount) };
}

/** Used when no Anthropic key is configured, so the rest of the pipeline can still be exercised. */
function mockScript(prompt: string, sceneCount: number): Script {
  return {
    allowed: true,
    rejectionReason: "",
    title: prompt.slice(0, 40),
    caption: `${prompt.slice(0, 50)} 😂`,
    setting: "A colourful school classroom with a green chalkboard",
    characters: [
      { id: "teacher", name: "Sir", look: "Bald middle-aged teacher with a thick moustache, grey vest", voice: "George" },
      { id: "student", name: "Bunty", look: "Skinny schoolboy with messy black hair, beige uniform, red tie", voice: "Liam" },
    ],
    scenes: Array.from({ length: sceneCount }, (_, i) => ({
      visual: `Shot ${i + 1} of the story`,
      motion: "Characters gesture comically",
      speakerId: i % 2 === 0 ? "teacher" : "student",
      line: i % 2 === 0 ? "Homework kahan hai?" : "Sir, kutta kha gaya!",
    })),
  };
}
