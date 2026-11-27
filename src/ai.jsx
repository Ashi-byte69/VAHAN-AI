import React, { useEffect, useRef, useState } from 'react';

const languageCodes = { English: 'en-IN', Hindi: 'hi-IN', Kannada: 'kn-IN', Telugu: 'te-IN', Tamil: 'ta-IN' };
const demoAnswers = {
  English: 'I’m in demo mode. Add a Gemini API key to the local server to get vehicle-specific AI answers. For safety-critical issues, stop safely and contact a qualified mechanic.',
  Hindi: 'मैं अभी डेमो मोड में हूँ। वाहन से जुड़े AI जवाब पाने के लिए स्थानीय सर्वर में Gemini API key जोड़ें। सुरक्षा से जुड़ी समस्या में सुरक्षित जगह रुकें और योग्य मैकेनिक से संपर्क करें।',
  Kannada: 'ನಾನು ಈಗ ಡೆಮೊ ಮೋಡ್‌ನಲ್ಲಿದ್ದೇನೆ. ವಾಹನದ AI ಉತ್ತರಗಳಿಗಾಗಿ ಸ್ಥಳೀಯ ಸರ್ವರ್‌ಗೆ Gemini API key ಸೇರಿಸಿ. ಸುರಕ್ಷತೆಯ ಸಮಸ್ಯೆಯಾದರೆ ಸುರಕ್ಷಿತವಾಗಿ ನಿಲ್ಲಿಸಿ ಅರ್ಹ ಮೆಕ್ಯಾನಿಕ್ ಸಂಪರ್ಕಿಸಿ.',
  Telugu: 'నేను ప్రస్తుతం డెమో మోడ్‌లో ఉన్నాను. వాహనానికి సంబంధించిన AI సమాధానాల కోసం స్థానిక సర్వర్‌లో Gemini API key జోడించండి. భద్రత సమస్య ఉంటే సురక్షితంగా ఆపి నిపుణుడైన మెకానిక్‌ను సంప్రదించండి.',
  Tamil: 'நான் இப்போது டெமோ முறையில் இருக்கிறேன். வாகன AI பதில்களுக்கு உள்ளூர் சேவையகத்தில் Gemini API key சேர்க்கவும். பாதுகாப்பு பிரச்சினை இருந்தால் பாதுகாப்பாக நிறுத்தி தகுதியான மெக்கானிக்கை அணுகவும்.',
};

function useAiStatus() {
  const [status, setStatus] = useState({ ready: false, model: '' });
  useEffect(() => {
    let active = true;
    const refresh = () => fetch('/api/health')
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(result => { if (active) setStatus({ ready: Boolean(result.aiConfigured), model: result.model || '' }); })
      .catch(() => { if (active) setStatus({ ready: false, model: '' }); });
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return status;
}

function say(text, language) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageCodes[language] || 'en-IN';
  window.speechSynthesis.speak(utterance);
}

function requestError(message) {
  return message || 'Vahan AI could not finish that request. Please try again.';
}

export function Assistant({ active, profile, toast }) {
  const ai = useAiStatus();
  const [messages, setMessages] = useState([{ who: 'ai', text: `Hi ${profile.name || 'there'}! Ask about your ${active?.make || 'vehicle'} by typing or speaking.` }]);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(false);
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const send = async question => {
    const prompt = question.trim();
    if (!prompt || pending) return;
    const nextMessages = [...messages, { who: 'user', text: prompt }];
    setMessages(nextMessages);
    setText('');
    setPending(true);
    try {
      let answer;
      if (ai.ready) {
        const response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            language: profile.language,
            vehicle: `${active?.make || ''} ${active?.model || ''}`.trim(),
            messages: nextMessages.filter(message => message.who !== 'error').slice(-12).map(message => ({
              role: message.who === 'ai' ? 'assistant' : 'user',
              content: message.text,
            })),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error);
        answer = result.text;
      } else {
        answer = demoAnswers[profile.language] || demoAnswers.English;
      }
      setMessages(current => [...current, { who: 'ai', text: answer }]);
      if (profile.readAloud) say(answer, profile.language);
    } catch (error) {
      setMessages(current => [...current, { who: 'ai', text: requestError(error.message) }]);
      toast('Vahan AI could not reach the AI service.');
    } finally {
      setPending(false);
    }
  };

  const listen = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return toast('Voice input needs a supported browser, such as Chrome.');
    const recognition = new SpeechRecognition();
    recognition.lang = languageCodes[profile.language] || 'en-IN';
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); toast('Microphone unavailable. Check browser permission.'); };
    recognition.onresult = event => send(event.results[0][0].transcript);
    recognition.start();
  };

  const startOver = () => setMessages([{ who: 'ai', text: `Fresh start. What would you like to know about your ${active?.make || 'vehicle'}?` }]);
  const tryQuestions = ['What should I ask at my next service?', 'Explain a dashboard warning light', 'When does my insurance expire?'];

  return <>
    <div className="heading"><div><div className="eyebrow">Type or speak</div><h1>Vahan AI assistant</h1><p>Ask for help with your {active?.make || 'vehicle'}.</p></div><span className="demoTag">{ai.ready ? 'LIVE AI' : 'SAMPLE REPLIES'}</span></div>
    {ai.ready?<div className="note">Your question and vehicle make/model are sent to Google Gemini for a reply. Don’t include registration numbers or personal details.</div>:<div className="note">The assistant is in demo mode. Add a Gemini API key to <code>server/.env</code> to turn on AI replies.</div>}
    <div className="assistantLayout"><section className="chat">
      <div className="chatHead"><span>✳</span><b>Vahan AI<small>{ai.ready ? `Connected · ${ai.model}` : 'Demo mode · no API key'}</small></b><button onClick={startOver} disabled={pending}>New chat</button></div>
      <div className="messages">{messages.map((message,index)=><div className={`msg ${message.who}`} key={`${index}-${message.who}`}><p>{message.text}</p>{message.who==='ai'&&<button onClick={()=>say(message.text,profile.language)}>🔊 Listen</button>}</div>)}{pending&&<div className="msg ai"><p>Vahan AI is thinking…</p></div>}<div ref={end}/></div>
      <div className="compose"><button className={listening?'listening':''} onClick={listen} disabled={pending} aria-label="Speak your question">🎙</button><form onSubmit={event=>{event.preventDefault();send(text)}}><input value={text} onChange={event=>setText(event.target.value)} placeholder="Ask about service, warning lights, or a repair…" disabled={pending}/><button disabled={pending||!text.trim()} aria-label="Send question">↑</button></form></div>
      <small className="disclaimer">AI guidance can be wrong. Ask a qualified mechanic about safety-critical issues.</small>
    </section><aside className="panel tryPanel"><h2>Try asking</h2>{tryQuestions.map(question=><button key={question} onClick={()=>send(question)} disabled={pending}>{question} ↗</button>)}<p>Voice uses your browser’s speech features. Replies use your preferred language.</p></aside></div>
  </>;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read this image. Please choose it again.'));
    reader.readAsDataURL(file);
  });
}

export function PhotoScan({ active, save, profile }) {
  const ai = useAiStatus();
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState('Dashboard warning');
  const [consent, setConsent] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const choose = event => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!['image/jpeg','image/png','image/webp'].includes(selected.type)) {
      setError('Choose a JPEG, PNG, or WebP photo.');
      event.target.value = '';
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Choose a photo under 5 MB for this demo.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setUrl(URL.createObjectURL(selected));
    setAnalysis('');
    setError('');
    setConsent(false);
  };

  const analyze = async () => {
    if (!file || !ai.ready || !consent || busy) return;
    setBusy(true);
    setError('');
    try {
      const imageDataUrl = await readAsDataUrl(file);
      const response = await fetch('/api/photo-analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDataUrl, kind, language: profile.language, vehicle: `${active?.make || ''} ${active?.model || ''}`.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error);
      setAnalysis(result.text);
    } catch (cause) {
      setError(requestError(cause.message));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => { setFile(null); setUrl(''); setAnalysis(''); setError(''); setConsent(false); };
  const saveAnalysis = () => {
    save({ type: 'Photo', title: `${kind} analysis`, detail: analysis.slice(0, 500) });
    setAnalysis('');
  };

  return <>
    <div className="heading"><div><div className="eyebrow">Show what you see</div><h1>Photo upload</h1><p>Choose a dashboard photo, service bill, receipt, or document for {active?.make || 'your vehicle'}.</p></div><span className="demoTag">{ai.ready ? 'AI PHOTO ANALYSIS' : 'AI SETUP NEEDED'}</span></div>
    <div className="twoCols scanCols"><section className="panel scanPanel">
      <div className="scanHead"><div><h2>What are you uploading?</h2><p>Choose a clear JPEG, PNG, or WebP photo, up to 5 MB.</p></div><select value={kind} onChange={event=>{setKind(event.target.value);setAnalysis('');setError('')}}><option>Dashboard warning</option><option>Service bill</option><option>Insurance document</option><option>Fuel receipt</option></select></div>
      <label className="dropZone">{url?<img src={url} alt="Selected photo preview"/>:<><span>↑</span><b>Select a photo to preview</b><small>It stays in this browser until you choose to analyze it.</small><i className="btn secondary">Browse photos</i></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choose}/></label>
      {file&&<div className="fileLine"><b>{file.name}</b><button type="button" onClick={clear}>Remove</button></div>}
      {file&&<label className="consentRow"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>I understand that clicking “Analyze photo” sends this image to Google Gemini through Vahan AI. Free-tier content may be used to improve Google products. I’ll use a sample image or cover private details.</span></label>}
      {file&&<div className="formButtons"><button className="btn" type="button" onClick={analyze} disabled={!ai.ready||!consent||busy}>{busy?'Analyzing…':'Analyze photo'}</button>{!ai.ready&&<small>Add a Gemini API key to the local server to enable analysis.</small>}</div>}
      {error&&<div className="plannedResult"><b>Could not analyze this photo</b><p>{error}</p></div>}
      {analysis&&<div className="plannedResult"><b>Vahan AI’s photo notes</b><p>{analysis}</p><small>AI can misread images. Check extracted details before acting on them.</small><div className="formButtons"><button className="btn secondary" type="button" onClick={()=>setAnalysis('')}>Discard</button><button className="btn" type="button" onClick={saveAnalysis}>Save notes to vehicle history</button></div></div>}
    </section><aside className="panel"><h2>Photo privacy</h2><p className="muted">Vahan AI does not store the uploaded image on its local server. The image is sent to Google Gemini only after you check the box and click “Analyze photo”. Google may use free-tier prompts and responses to improve its products.</p><hr/><h3>What you can show</h3>{['Dashboard warning lights','Service and repair bills','Insurance and vehicle documents','Fuel receipts'].map((item,index)=><div className="usecase" key={item}><span>{['◉','▤','◇','₹'][index]}</span>{item}</div>)}<div className="tip">For this early demo, use sample images and cover registration numbers, addresses, and policy numbers when they aren’t needed.</div></aside></div>
  </>;
}
