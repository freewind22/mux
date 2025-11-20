
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.API_KEY || '';
let ai: GoogleGenAI | null = null;

if (GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

export const generateNPCResponse = async (
  npcName: string, 
  playerClass: string, 
  playerLevel: number, 
  prompt: string
): Promise<string> => {
  if (!ai) {
    return "神灵保持沉默... (API Key 缺失)";
  }

  const systemInstruction = `
    你是一个名为《奇迹MU》的网游中的NPC。
    你的名字是 ${npcName}.
    与你对话的玩家是一个 ${playerLevel} 级的 ${playerClass}.
    请用简短、带有中世纪奇幻色彩的中文风格说话，适合MMORPG。
    不要太啰嗦，通常保持在2句话以内。
    如果你是铁匠，就抱怨天气热或者夸赞好金属。
    如果你是老板娘，就推销酒水或者聊八卦。
    如果你是仙踪林精灵，说话要优雅神秘。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        maxOutputTokens: 100,
      },
    });
    return response.text || "...";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "我现在无法说话，服务器繁忙。";
  }
};
