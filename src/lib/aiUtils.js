export async function enhanceText(text, systemInstruction) {
  if (!text || !text.trim()) {
    throw new Error("Text content is empty");
  }
  
  const response = await fetch("/api/sambanova/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${import.meta.env.VITE_SAMBANOVA_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "DeepSeek-V3.1",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: `Rough notes: ${text}` }
      ],
      temperature: 0.1,
      top_p: 0.1
    })
  });
  
  if (!response.ok) {
    throw new Error(`AI request failed with status: ${response.status}`);
  }
  const data = await response.json();
  if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error("Invalid AI response structure");
  }
  return data.choices[0].message.content;
}
