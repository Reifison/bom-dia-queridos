import { GoogleGenAI, Type } from "@google/genai";

// Inicializa o cliente do Gemini
// O AI Studio injeta a chave automaticamente em process.env.GEMINI_API_KEY
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateDailyMessage(period: 'morning' | 'afternoon' | 'night'): Promise<{ mainText: string; quote?: string }> {
  try {
    const ai = getAiClient();
    
    const periodNames = {
      morning: 'manhã',
      afternoon: 'tarde',
      night: 'noite'
    };

    const prompt = `Crie uma mensagem motivacional curta e acolhedora para o período da ${periodNames[period]}.
    A mensagem deve ser otimista, fácil de ler e perfeita para compartilhar no WhatsApp.
    Retorne um JSON com:
    - mainText: A frase principal (obrigatório).
    - quote: Uma citação curta de um autor ou filme (opcional, use apenas se agregar valor).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview', // Modelo mais barato e rápido para texto
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mainText: { type: Type.STRING, description: "Frase principal da mensagem" },
            quote: { type: Type.STRING, description: "Citação opcional" }
          },
          required: ['mainText']
        }
      }
    });

    if (!response.text) throw new Error("Resposta vazia do modelo de texto.");
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Erro ao gerar texto:", error);
    throw error;
  }
}

export async function generateDailyImage(period: 'morning' | 'afternoon' | 'night'): Promise<string> {
  try {
    const ai = getAiClient();
    
    const periodPrompts = {
      morning: 'Nascer do sol suave, xícara de café, flores frescas, luz da manhã, fotografia de alta qualidade, acolhedor, sem texto.',
      afternoon: 'Tarde ensolarada, paisagem tranquila, luz dourada, natureza, fotografia de alta qualidade, relaxante, sem texto.',
      night: 'Céu estrelado, lua, paisagem noturna serena, luzes suaves, fotografia de alta qualidade, pacífico, sem texto.'
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Modelo mais barato para imagens
      contents: {
        parts: [
          { text: periodPrompts[period] }
        ]
      },
      config: {
        // @ts-ignore - imageConfig is valid for image models in the SDK
        imageConfig: {
          aspectRatio: "3:4" // Proporção ideal para o card do app
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("Nenhuma imagem retornada pelo modelo.");
  } catch (error) {
    console.error("Erro ao gerar imagem:", error);
    throw error;
  }
}
