import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Category, Expense, Income } from '@/types/budget';
import { format } from 'date-fns';

export interface ParsedTransaction {
  type: 'expense' | 'income';
  description: string;
  amount: number;
  categoryId?: string;
  categoryName?: string;
}

interface UseVoiceInputProps {
  categories: Category[];
  onAddExpense?: (exp: Omit<Expense, 'id'>) => void;
  onAddIncome?: (inc: Omit<Income, 'id'>) => void;
}

export function useVoiceInput({ categories, onAddExpense, onAddIncome }: UseVoiceInputProps) {
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  
  const recognitionRef = useRef<any>(null);
  const processWithAIRef = useRef<(text: string) => void>();

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Erro', description: 'Seu navegador não suporta reconhecimento de voz.', variant: 'destructive' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const text = finalTranscript.trim();
      if (text) {
        processWithAIRef.current?.(text);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript('');
    setParsedTransactions([]);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const processWithAI = useCallback(async (text?: string) => {
    const inputText = text || transcript.trim();
    if (!inputText) {
      if (!text) toast({ title: 'Erro', description: 'Diga algo primeiro!', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-voice', {
        body: {
          text: inputText,
          categories: categories.map(c => ({ id: c.id, name: c.name })),
        },
      });

      if (error) throw error;

      if (data?.transactions && data.transactions.length > 0) {
        setParsedTransactions(data.transactions);
      } else {
        toast({ title: 'Hmm...', description: 'Não consegui identificar nenhum registro. Tente novamente.', variant: 'destructive' });
      }
    } catch (err) {
      console.error('AI processing error:', err);
      toast({ title: 'Erro', description: 'Falha ao processar com IA. Tente novamente.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  }, [transcript, categories]);

  useEffect(() => {
    processWithAIRef.current = processWithAI;
  }, [processWithAI]);

  const confirmTransactions = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    let added = 0;

    parsedTransactions.forEach(t => {
      if (t.type === 'expense' && t.categoryId && onAddExpense) {
        onAddExpense({
          categoryId: t.categoryId,
          description: t.description,
          amount: t.amount,
          date: today,
          isFixed: false,
          status: 'pending',
        });
        added++;
      } else if (t.type === 'income' && onAddIncome) {
        onAddIncome({
          categoryId: t.categoryId,
          description: t.description,
          amount: t.amount,
          date: today,
          isRecurring: false,
          status: 'pending',
        });
        added++;
      }
    });

    if (added > 0) {
      toast({ title: 'Registrado!', description: `${added} registro(s) adicionado(s) com sucesso.` });
    }
    setParsedTransactions([]);
    setTranscript('');
    setIsVoiceOpen(false);
  }, [parsedTransactions, onAddExpense, onAddIncome]);

  const resetVoiceState = useCallback(() => {
    stopListening();
    setParsedTransactions([]);
    setTranscript('');
  }, [stopListening]);

  return {
    isVoiceOpen,
    setIsVoiceOpen,
    isListening,
    isProcessing,
    transcript,
    parsedTransactions,
    startListening,
    stopListening,
    confirmTransactions,
    resetVoiceState,
  };
}
