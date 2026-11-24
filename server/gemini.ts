import { GoogleGenAI, Type } from '@google/genai';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trên máy chủ. Vui lòng kiểm tra mục Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateThinkFirstReflection(
  subject: string,
  question: string,
  initialThinking: string,
  confidence: number
): Promise<string> {
  const ai = getClient();
  const prompt = [
    `Môn học: ${subject}`,
    `Câu hỏi / Bài toán học sinh đang giải: ${question}`,
    `Suy nghĩ ban đầu của học sinh (độ tự tin ${confidence}/5): ${initialThinking}`,
    '',
    'Hãy đóng vai giáo viên cố vấn theo phương pháp Think First (bằng tiếng Việt, súc tích 3-5 câu):',
    '1) Ghi nhận điểm đúng hoặc hợp lý trong tư duy ban đầu của học sinh.',
    '2) Chỉ ra một điểm cần kiểm chứng hoặc góc nhìn còn thiếu (nếu có) mà không giải hộ toàn bộ.',
    '3) Đặt 1 câu hỏi gợi mở cụ thể để học sinh tự hoàn thiện bước tiếp theo.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Bạn là cố vấn học tập Socratic của hệ thống EDU SMART. Luôn trả lời bằng tiếng Việt rõ ràng, khích lệ tư duy độc lập, không đưa ra đáp án chép sẵn.',
    },
  });

  return (response.text ?? '').trim() || 'Chưa nhận được phản hồi từ AI.';
}

export interface CoachHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function generateCoachReply(
  subject: string,
  history: CoachHistoryItem[],
  userMessage: string
): Promise<string> {
  const ai = getClient();
  const transcript = history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Học sinh' : 'AI Coach'}: ${m.content}`)
    .join('\n');

  const prompt = [
    `Môn học hiện tại: ${subject}`,
    transcript ? `Lịch sử trao đổi gần nhất:\n${transcript}` : '',
    `Tin nhắn mới của học sinh: ${userMessage}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Bạn là AI Coach của nền tảng EDU SMART. Hãy hướng dẫn học sinh trung học phổ thông Việt Nam tự giải quyết vấn đề từng bước bằng phương pháp Socratic: giải thích khái niệm ngắn gọn, kiểm tra hiểu biết, gợi ý từng bước và tuyệt đối không làm bài hộ trọn gói khi học sinh chưa tự suy nghĩ.',
    },
  });

  return (response.text ?? '').trim() || 'Cô/thầy AI chưa thể tạo phản hồi lúc này.';
}

export interface FactCheckResult {
  verdict: string;
  explanation: string;
  studyTip: string;
}

export async function runFactCheck(claim: string): Promise<FactCheckResult> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Hãy kiểm chứng tính chính xác học thuật của nhận định sau bằng tiếng Việt:\n"${claim}"`,
    config: {
      systemInstruction:
        'Bạn là chuyên gia thẩm định kiến thức khoa học và phổ thông tại EDU SMART. Phân tích khách quan, chỉ rõ điểm đúng/sai và đưa ra lời khuyên ôn tập.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          verdict: {
            type: Type.STRING,
            description: 'Một trong ba giá trị: "Chính xác", "Cần kiểm chứng thêm", hoặc "Chưa chính xác".',
          },
          explanation: {
            type: Type.STRING,
            description: 'Giải thích ngắn gọn, rõ ràng dựa trên kiến thức chuẩn sách giáo khoa/khoa học.',
          },
          studyTip: {
            type: Type.STRING,
            description: 'Một gợi ý tự kiểm chứng hoặc ghi nhớ kiến thức cho học sinh.',
          },
        },
        required: ['verdict', 'explanation', 'studyTip'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<FactCheckResult>;
  return {
    verdict: parsed.verdict || 'Cần kiểm chứng thêm',
    explanation: parsed.explanation || 'Không thể phân tích nhận định này.',
    studyTip: parsed.studyTip || 'Hãy đối chiếu lại định nghĩa trong sách giáo khoa.',
  };
}

export interface SelfTestQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export async function generateSelfTestQuestions(
  subject: string,
  topic: string
): Promise<SelfTestQuestion[]> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Tạo đúng 5 câu hỏi trắc nghiệm khách quan (mỗi câu 4 phương án A/B/C/D không cần ghi chữ cái đầu) bằng tiếng Việt cho môn ${subject}, chủ đề: "${topic}". Mức độ từ thông hiểu đến vận dụng phù hợp học sinh THPT.`,
    config: {
      systemInstruction:
        'Bạn là chuyên gia ra đề kiểm tra năng lực của EDU SMART. Trả về JSON chuẩn xác, đáp án duy nhất đúng và lời giải thích ngắn gọn.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            correctIndex: { type: Type.INTEGER },
            explanation: { type: Type.STRING },
          },
          required: ['question', 'options', 'correctIndex', 'explanation'],
        },
      },
    },
  });

  const raw = JSON.parse((response.text ?? '[]').trim()) as SelfTestQuestion[];
  return raw
    .filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2)
    .slice(0, 5)
    .map((q) => ({
      question: q.question,
      options: q.options.slice(0, 4),
      correctIndex: Math.max(0, Math.min(q.options.length - 1, Number(q.correctIndex) || 0)),
      explanation: q.explanation || '',
    }));
}
