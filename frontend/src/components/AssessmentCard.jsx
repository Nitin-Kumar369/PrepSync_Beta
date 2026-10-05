import React, { useState, useEffect } from 'react'
import API from '../store/authStore'
import Button from './UI/Button'
import { 
  Award, Clock, CheckCircle2, XCircle, RotateCcw, 
  HelpCircle, ChevronRight, ChevronLeft, Flag, Check,
  ChevronDown, ChevronUp
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import 'katex/dist/katex.min.css'

export default function AssessmentCard({ 
  quiz, 
  bookId, 
  initialExpanded = true,
  onClose, 
  onAskFollowup,
  onRetest 
}) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [flagged, setFlagged] = useState({})
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(quiz.result || null)
  const [error, setError] = useState(null)

  const questions = quiz.questions || []
  const currentQ = questions[currentIndex]

  // Main Subject vs Specific Sub-Topic
  const mainSubject = quiz.subject || quiz.topic || 'Engineering Assessment'
  const subTopic = (quiz.subject && quiz.topic && quiz.topic !== quiz.subject) ? quiz.topic : (quiz.mode === 'post_response' ? 'Response Quiz' : null)

  useEffect(() => {
    if (result) return
    const timer = setInterval(() => setTimeElapsed(prev => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [result])

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`
  }

  const handleSelectOption = (qId, optionIdx) => {
    setAnswers(prev => ({ ...prev, [qId]: optionIdx }))
  }

  const toggleFlag = (qId) => {
    setFlagged(prev => ({ ...prev, [qId]: !prev[qId] }))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = {
        assessment_id: quiz.assessment_id,
        book_id: bookId,
        time_taken_seconds: timeElapsed,
        answers: questions.map(q => ({
          question_id: q.id,
          selected_option_index: answers[q.id] !== undefined ? answers[q.id] : null
        }))
      }
      const res = await API.post('/assessment/submit', payload)
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to grade assessment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inlineMarkdownComponents = {
    p: ({ node, ...props }) => <span className="inline leading-relaxed" {...props} />
  }

  return (
    <div className="my-5 bg-white dark:bg-[#1e1e1e] rounded-3xl border border-slate-200 dark:border-[#333333] shadow-sm overflow-hidden transition-all">
      {/* Collapsible Header Ribbon */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252526] transition-colors select-none"
      >
        <div className="flex items-center gap-3 min-w-0 pr-3">
          <div className={`p-2 rounded-xl shrink-0 ${
            result 
              ? (result.percentage >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300')
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
          }`}>
            <Award className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Primary Name: Subject */}
              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">
                {mainSubject}
              </span>
              {/* Subtitle Badge: Specific Topic / Test Name */}
              {subTopic && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 truncate">
                  {subTopic}
                </span>
              )}
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {quiz.difficulty || 'Quiz'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {result 
                ? `Completed: ${result.score} / ${result.total_questions} (${result.percentage}%)` 
                : `${questions.length} questions • ${quiz.completed ? 'Completed' : 'In Progress'}`
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {result && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              result.percentage >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
              result.percentage >= 60 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
              'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
            }`}>
              {result.percentage}%
            </span>
          )}
          <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded Content View */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-[#333333] p-6 space-y-6">
          {result ? (
            /* Result Review View */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-[#333333] pb-4">
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    Score: {result.score} / {result.total_questions} ({result.percentage}%)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{result.feedback}</p>
                </div>
                {onRetest && (
                  <Button 
                    variant="secondary" 
                    onClick={onRetest}
                    className="rounded-full text-xs px-4 py-2 border-slate-200 dark:border-slate-700 flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Retake Test
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {result.results?.map((r, idx) => (
                  <div 
                    key={idx}
                    className={`p-4 sm:p-5 rounded-2xl border text-sm transition-all ${
                      r.is_correct 
                        ? 'bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/50'
                        : 'bg-red-50/40 border-red-200 dark:bg-red-950/20 dark:border-red-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 font-semibold text-slate-900 dark:text-slate-100 mb-2">
                      {r.is_correct ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      )}
                      <div className="markdown-content">
                        <ReactMarkdown 
                          remarkPlugins={[remarkMath, remarkGfm]} 
                          rehypePlugins={[rehypeKatex]}
                        >
                          {r.question}
                        </ReactMarkdown>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3">
                      {r.options.map((opt, oIdx) => {
                        const isUser = r.user_answer === oIdx
                        const isCorrect = r.correct_answer === oIdx
                        return (
                          <div 
                            key={oIdx}
                            className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
                              isCorrect 
                                ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950 dark:bg-emerald-900/40 dark:border-emerald-600 dark:text-emerald-200 font-bold'
                                : isUser && !isCorrect
                                ? 'bg-red-100/70 border-red-300 text-red-950 dark:bg-red-900/40 dark:border-red-600 dark:text-red-200 line-through'
                                : 'bg-white dark:bg-[#252526] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 opacity-70'
                            }`}
                          >
                            <ReactMarkdown 
                              remarkPlugins={[remarkMath, remarkGfm]} 
                              rehypePlugins={[rehypeKatex]}
                              components={inlineMarkdownComponents}
                            >
                              {opt}
                            </ReactMarkdown>
                            <span className="shrink-0 ml-2">
                              {isCorrect && ' ✓'}
                              {isUser && !isCorrect && ' ✗'}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    <div className="bg-white/80 dark:bg-[#252526] p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
                      <strong className="block mb-1 text-slate-900 dark:text-slate-100">Explanation:</strong>
                      <ReactMarkdown 
                        remarkPlugins={[remarkMath, remarkGfm]} 
                        rehypePlugins={[rehypeKatex]}
                      >
                        {r.explanation}
                      </ReactMarkdown>
                    </div>

                    {!r.is_correct && onAskFollowup && (
                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={() => onAskFollowup(r.remediation_prompt)}
                          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1.5 hover:underline"
                        >
                          <HelpCircle className="w-3.5 h-3.5" /> Explain why I was wrong in chat
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Active Test Taking View */
            <div className="space-y-6">
              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-1.5 transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100 dark:border-slate-700">
                <span>Question {currentIndex + 1} of {questions.length}</span>
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3.5 h-3.5 text-blue-600" /> {formatTime(timeElapsed)}
                </span>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-medium border border-red-200">
                  {error}
                </div>
              )}

              {currentQ && (
                <div className="space-y-4">
                  <div className="text-slate-900 dark:text-slate-100 font-semibold text-base leading-relaxed markdown-content">
                    <ReactMarkdown 
                      remarkPlugins={[remarkMath, remarkGfm]} 
                      rehypePlugins={[rehypeKatex]}
                    >
                      {currentQ.question}
                    </ReactMarkdown>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 pt-1">
                    {currentQ.options.map((opt, optIdx) => {
                      const isSelected = answers[currentQ.id] === optIdx
                      return (
                        <button
                          key={optIdx}
                          onClick={() => handleSelectOption(currentQ.id, optIdx)}
                          className={`w-full text-left p-4 rounded-2xl border text-sm font-medium transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white dark:bg-[#252526] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                          }`}
                        >
                          <div className="flex-1 pr-3">
                            <ReactMarkdown 
                              remarkPlugins={[remarkMath, remarkGfm]} 
                              rehypePlugins={[rehypeKatex]}
                              components={inlineMarkdownComponents}
                            >
                              {opt}
                            </ReactMarkdown>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                  {questions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentIndex(idx)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                        idx === currentIndex 
                          ? 'ring-2 ring-blue-600 bg-blue-600 text-white'
                          : answers[q.id] !== undefined
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
                          : 'bg-slate-50 dark:bg-[#252526] border border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentIndex === 0}
                    className="p-2 border border-slate-200 rounded-xl disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {currentIndex < questions.length - 1 ? (
                    <Button 
                      variant="secondary"
                      onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                      className="rounded-full text-xs px-4 py-2"
                    >
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="rounded-full text-xs px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                    >
                      {isSubmitting ? 'Evaluating...' : 'Submit Test'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}