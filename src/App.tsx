/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  Circle, 
  Calendar, 
  Euro, 
  User, 
  Sparkles, 
  Printer, 
  ChevronRight,
  MapPin,
  Clock,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { TripItem, ItemType, TripConfig } from './types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [items, setItems] = useState<TripItem[]>([]);
  const [config, setConfig] = useState<TripConfig>({});
  const [modalItem, setModalItem] = useState<TripItem | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingEvent, setEditingEvent] = useState<{ dayIdx: number, eventIdx: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'draft' | 'planner' | 'summary' | 'costs'>('draft');

  useEffect(() => {
    fetchItems();
    fetchConfig();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'UPDATE_ITEMS') fetchItems();
      if (data.type === 'UPDATE_CONFIG') fetchConfig();
    };

    return () => ws.close();
  }, []);

  const fetchItems = async () => {
    const res = await fetch('/api/items');
    const data = await res.json();
    setItems(data.map((item: any) => ({ ...item, chosen: !!item.chosen })));
  };

  const fetchConfig = async () => {
    const res = await fetch('/api/config');
    const data = await res.json();
    setConfig(data);
  };

  const saveItem = async (item: TripItem) => {
    await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
  };

  const deleteItem = async (id: string) => {
    await fetch(`/api/items/${id}`, { method: 'DELETE' });
  };

  const saveConfig = async (key: string, value: string) => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
  };

  const handleSaveModalItem = async () => {
    if (!modalItem || !modalItem.name) return;
    
    const itemToSave = {
      ...modalItem,
      id: modalItem.id || Math.random().toString(36).substr(2, 9),
    };

    await saveItem(itemToSave);
    setModalItem(null);
  };

  const toggleChosen = (item: TripItem) => {
    saveItem({ ...item, chosen: !item.chosen });
  };

  const generateItinerary = async () => {
    setIsGenerating(true);
    try {
      const chosenItems = items.filter(i => i.chosen);
      const prompt = `
        We are planning a trip to Barcelona from ${config.startDate || 'unknown'} to ${config.endDate || 'unknown'}.
        Our budget is ${config.budget || 'flexible'}.
        We have already chosen these items:
        ${JSON.stringify(chosenItems.map(i => ({ name: i.name, type: i.type, notes: i.notes })))}
        
        Please create a detailed daily itinerary. 
        Fill in gaps with authentic Barcelona suggestions (hidden gems, local favorites).
        Ensure a good mix of activities, rest, and dining.
        Format the response as a JSON array of days, where each day has a date and a list of events with time, activity, and type (hotel, activity, eating).
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                events: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      time: { type: Type.STRING },
                      activity: { type: Type.STRING },
                      type: { type: Type.STRING },
                      description: { type: Type.STRING }
                    }
                  }
                }
              }
            }
          }
        }
      });

      const itinerary = JSON.parse(response.text || '[]');
      await saveConfig('itinerary', JSON.stringify(itinerary));
      setActiveTab('planner');
    } catch (error) {
      console.error("Failed to generate itinerary:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const getItemStyle = (type: ItemType) => {
    switch (type) {
      case 'hotel': return 'bg-blue-500 text-white shape-square';
      case 'activity': return 'bg-emerald-500 text-white shape-pill';
      case 'eating': return 'bg-orange-500 text-white shape-hexagon';
    }
  };

  const totalCost = useMemo(() => items.reduce((sum, item) => sum + (item.chosen ? item.cost : 0), 0), [items]);

  const itineraryData = useMemo(() => {
    try {
      return JSON.parse(config.itinerary || '[]');
    } catch {
      return [];
    }
  }, [config.itinerary]);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200 px-6 py-4 no-print">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center text-white">
              <Sparkles size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Barcelona Trip Brain</h1>
          </div>
          <nav className="flex gap-1 bg-stone-100 p-1 rounded-lg">
            {(['draft', 'planner', 'summary', 'costs'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab 
                    ? 'bg-white text-stone-900 shadow-sm' 
                    : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Draft Tab */}
        {activeTab === 'draft' && (
          <div className="space-y-8">
            <section className="bg-white rounded-3xl p-8 border border-stone-200 shadow-sm">
              <h2 className="text-2xl font-bold mb-6">Trip Setup</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Start Date</label>
                  <input 
                    type="date" 
                    value={config.startDate || ''} 
                    onChange={(e) => saveConfig('startDate', e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">End Date</label>
                  <input 
                    type="date" 
                    value={config.endDate || ''} 
                    onChange={(e) => saveConfig('endDate', e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Budget (€)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 1500"
                    value={config.budget || ''} 
                    onChange={(e) => saveConfig('budget', e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none"
                  />
                </div>
              </div>
            </section>

            <section>
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h2 className="text-2xl font-bold">Brainstorming</h2>
                  <p className="text-stone-500">Add ideas for hotels, things to do, and places to eat.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setModalItem({ id: '', type: 'hotel', name: '', notes: '', link: '', role: '', cost: 0, chosen: false, date: '' })} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                    <Plus size={18} /> Hotel
                  </button>
                  <button onClick={() => setModalItem({ id: '', type: 'activity', name: '', notes: '', link: '', role: '', cost: 0, chosen: false, date: '' })} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                    <Plus size={18} /> Activity
                  </button>
                  <button onClick={() => setModalItem({ id: '', type: 'eating', name: '', notes: '', link: '', role: '', cost: 0, chosen: false, date: '' })} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
                    <Plus size={18} /> Eating
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                  {items.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm relative group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className={`w-12 h-12 flex items-center justify-center ${getItemStyle(item.type)}`}>
                          {item.type === 'hotel' && <Calendar size={20} />}
                          {item.type === 'activity' && <MapPin size={20} />}
                          {item.type === 'eating' && <Clock size={20} />}
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => toggleChosen(item)}
                            className={`p-2 rounded-lg transition-colors ${item.chosen ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-400 hover:text-stone-600'}`}
                          >
                            <CheckCircle2 size={18} />
                          </button>
                          <button 
                            onClick={() => deleteItem(item.id)}
                            className="p-2 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-lg font-bold mb-2">{item.name}</h3>
                      <p className="text-stone-500 text-sm mb-4 line-clamp-2">{item.notes}</p>
                      <div className="flex flex-wrap gap-2 mt-auto">
                        {item.date && (
                          <span className="flex items-center gap-1 text-xs font-medium text-stone-400">
                            <Calendar size={12} /> {item.date}
                          </span>
                        )}
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                            <ExternalLink size={12} /> Link
                          </a>
                        )}
                        <span className="flex items-center gap-1 text-xs font-medium text-stone-400">
                          <User size={12} /> {item.role || 'Unassigned'}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-medium text-stone-400">
                          <Euro size={12} /> {item.cost}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          </div>
        )}

        {/* Planner Tab */}
        {activeTab === 'planner' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center no-print">
              <div>
                <h2 className="text-3xl font-bold">Master Itinerary</h2>
                <p className="text-stone-500">Your AI-optimized schedule for Barcelona.</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={generateItinerary}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  <Sparkles size={18} /> {isGenerating ? 'Generating...' : 'Re-Generate AI Plan'}
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors">
                  <Printer size={18} /> Print Timeline
                </button>
              </div>
            </div>

            <div className="space-y-12 relative">
              {/* Vertical Line */}
              <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-stone-200 hidden md:block" />

              {itineraryData.map((day: any, idx: number) => (
                <div key={idx} className="relative">
                  <div className="md:ml-20 mb-6">
                    <h3 className="text-xl font-bold bg-stone-900 text-white inline-block px-4 py-1 rounded-lg shadow-lg">
                      {day.date}
                    </h3>
                  </div>
                  <div className="space-y-6">
                    {day.events.map((event: any, eIdx: number) => {
                      const existingItem = items.find(i => i.name === event.activity);
                      return (
                        <div key={eIdx} className="flex flex-col md:flex-row gap-4 md:gap-12 items-start">
                          <div className="w-20 text-right font-mono text-sm text-stone-400 pt-4 hidden md:block">
                            {event.time}
                          </div>
                          <div className={`flex-1 bg-white p-6 rounded-2xl border shadow-sm relative transition-all ${existingItem?.chosen ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-stone-200'}`}>
                            {/* Dot on line */}
                            <div className={`absolute -left-[53px] top-8 w-4 h-4 rounded-full border-4 border-stone-50 hidden md:block ${
                              event.type === 'hotel' ? 'bg-blue-500' : 
                              event.type === 'activity' ? 'bg-emerald-500' : 'bg-orange-500'
                            }`} />
                            
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                {editingEvent?.dayIdx === idx && editingEvent?.eventIdx === eIdx ? (
                                  <div className="space-y-2 mb-2">
                                    <input 
                                      type="text" 
                                      value={event.activity} 
                                      onChange={(e) => {
                                        const newItinerary = [...itineraryData];
                                        newItinerary[idx].events[eIdx].activity = e.target.value;
                                        saveConfig('itinerary', JSON.stringify(newItinerary));
                                      }}
                                      className="w-full p-1 text-lg font-bold border-b border-stone-300 outline-none"
                                    />
                                    <input 
                                      type="text" 
                                      value={event.time} 
                                      onChange={(e) => {
                                        const newItinerary = [...itineraryData];
                                        newItinerary[idx].events[eIdx].time = e.target.value;
                                        saveConfig('itinerary', JSON.stringify(newItinerary));
                                      }}
                                      className="w-full p-1 text-xs font-mono border-b border-stone-300 outline-none"
                                    />
                                  </div>
                                ) : (
                                  <>
                                    <h4 className="text-lg font-bold">{event.activity}</h4>
                                    <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded ${
                                      event.type === 'hotel' ? 'bg-blue-100 text-blue-600' : 
                                      event.type === 'activity' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'
                                    }`}>
                                      {event.type}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => setEditingEvent(editingEvent?.dayIdx === idx && editingEvent?.eventIdx === eIdx ? null : { dayIdx: idx, eventIdx: eIdx })}
                                  className={`p-1 transition-colors ${editingEvent?.dayIdx === idx && editingEvent?.eventIdx === eIdx ? 'text-emerald-600' : 'text-stone-300 hover:text-stone-600'}`}
                                >
                                  {editingEvent?.dayIdx === idx && editingEvent?.eventIdx === eIdx ? <CheckCircle2 size={16} /> : <MessageSquare size={16} />}
                                </button>
                                <button 
                                  onClick={() => setModalItem(existingItem || {
                                    id: '',
                                    type: event.type as ItemType,
                                    name: event.activity,
                                    notes: event.description,
                                    link: '',
                                    role: '',
                                    cost: 0,
                                    chosen: true,
                                    date: day.date,
                                    time: event.time
                                  })}
                                  className={`p-1 transition-colors ${existingItem?.chosen ? 'text-emerald-600' : 'text-stone-300 hover:text-stone-600'}`}
                                >
                                  {existingItem?.chosen ? <CheckCircle2 size={16} /> : <Plus size={16} />}
                                </button>
                                <button 
                                  onClick={() => {
                                    const newItinerary = [...itineraryData];
                                    newItinerary[idx].events.splice(eIdx, 1);
                                    if (newItinerary[idx].events.length === 0) newItinerary.splice(idx, 1);
                                    saveConfig('itinerary', JSON.stringify(newItinerary));
                                  }}
                                  className="p-1 text-stone-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                            <p className="text-stone-500 text-sm">{event.description}</p>
                            <div className="md:hidden mt-2 font-mono text-xs text-stone-400">
                              {event.time}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              {itineraryData.length === 0 && (
                <div className="text-center py-24">
                  <Sparkles size={48} className="mx-auto text-stone-200 mb-4" />
                  <p className="text-stone-400">No itinerary generated yet. Click "Re-Generate AI Plan" to get started!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold">Trip Summary</h2>
                <p className="text-stone-500">Overview of chosen items and ready to finalize.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400">Finalized Items</h3>
                {items.filter(i => i.chosen).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((item) => (
                  <div key={item.id} className="bg-white p-4 rounded-xl border border-stone-200 flex items-center gap-4">
                    <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center ${getItemStyle(item.type)}`}>
                      {item.type === 'hotel' && <Calendar size={16} />}
                      {item.type === 'activity' && <MapPin size={16} />}
                      {item.type === 'eating' && <Clock size={16} />}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold">{item.name}</h4>
                      <div className="flex gap-3 text-xs text-stone-500">
                        <span className="flex items-center gap-1"><Calendar size={12} /> {item.date || 'TBD'}</span>
                        <span className="flex items-center gap-1"><User size={12} /> {item.role || 'Unassigned'}</span>
                        <span className="flex items-center gap-1"><Euro size={12} /> {item.cost}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setModalItem(item)} className="p-2 text-stone-300 hover:text-stone-600 transition-colors">
                        <MessageSquare size={18} />
                      </button>
                      <button onClick={() => toggleChosen(item)} className="p-2 text-stone-300 hover:text-red-500 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {items.filter(i => i.chosen).length === 0 && (
                  <div className="text-center py-12 bg-stone-100 rounded-3xl border-2 border-dashed border-stone-200">
                    <p className="text-stone-400">No items chosen yet. Go to Planner to select your favorites!</p>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="bg-stone-900 text-white p-8 rounded-3xl">
                  <h3 className="text-stone-400 text-xs font-bold uppercase tracking-widest mb-2">Total Estimated Cost</h3>
                  <div className="text-4xl font-bold mb-4">€{totalCost}</div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-400 transition-all duration-1000" 
                      style={{ width: `${Math.min((totalCost / (Number(config.budget) || 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-stone-400 mt-2">Budget: €{config.budget || '?'}</p>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-stone-200">
                  <h3 className="font-bold mb-4">Responsibilities</h3>
                  <div className="space-y-3">
                    {Array.from(new Set(items.filter(i => i.chosen).map(i => i.role))).map(role => (
                      <div key={role} className="flex justify-between items-center">
                        <span className="text-sm text-stone-600">{role || 'Unassigned'}</span>
                        <span className="text-xs font-bold bg-stone-100 px-2 py-1 rounded-md">
                          {items.filter(i => i.chosen && i.role === role).length} tasks
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Costs Tab */}
        {activeTab === 'costs' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold">Shared Cost Spreadsheet</h2>
              <p className="text-stone-500">Track who owes what for the trip.</p>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400">Item</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400">Type</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400">Responsible</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-stone-400 text-right">Cost (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(i => i.chosen).map((item) => (
                    <tr key={item.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                      <td className="p-4 font-medium">{item.name}</td>
                      <td className="p-4">
                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
                          item.type === 'hotel' ? 'bg-blue-100 text-blue-600' : 
                          item.type === 'activity' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'
                        }`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="p-4 text-stone-500">{item.role || '-'}</td>
                      <td className="p-4 text-right font-mono">€{item.cost.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-stone-900 text-white font-bold">
                    <td colSpan={3} className="p-4 text-right">Total Trip Cost</td>
                    <td className="p-4 text-right font-mono text-xl">€{totalCost.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      <AnimatePresence>
        {modalItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setModalItem(null)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">{modalItem.id ? 'Edit' : 'Add'} {modalItem.type.charAt(0).toUpperCase() + modalItem.type.slice(1)}</h3>
                <div className={`w-10 h-10 flex items-center justify-center ${getItemStyle(modalItem.type)}`}>
                  {modalItem.type === 'hotel' && <Calendar size={20} />}
                  {modalItem.type === 'activity' && <MapPin size={20} />}
                  {modalItem.type === 'eating' && <Clock size={20} />}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Name</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={modalItem.name}
                    onChange={(e) => setModalItem({ ...modalItem, name: e.target.value })}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none"
                    placeholder="e.g. Hotel Arts Barcelona"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Notes</label>
                  <textarea 
                    value={modalItem.notes}
                    onChange={(e) => setModalItem({ ...modalItem, notes: e.target.value })}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none h-24"
                    placeholder="Why do we like this?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Date</label>
                    <input 
                      type="date" 
                      value={modalItem.date || ''}
                      onChange={(e) => setModalItem({ ...modalItem, date: e.target.value })}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Cost (€)</label>
                    <input 
                      type="number" 
                      value={modalItem.cost}
                      onChange={(e) => setModalItem({ ...modalItem, cost: Number(e.target.value) })}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Role</label>
                  <input 
                    type="text" 
                    value={modalItem.role}
                    onChange={(e) => setModalItem({ ...modalItem, role: e.target.value })}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none"
                    placeholder="Who's booking?"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Link</label>
                  <input 
                    type="text" 
                    value={modalItem.link}
                    onChange={(e) => setModalItem({ ...modalItem, link: e.target.value })}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-900 outline-none"
                    placeholder="Booking.com, Instagram, etc."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setModalItem(null)}
                  className="flex-1 px-6 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveModalItem}
                  className="flex-1 px-6 py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-colors"
                >
                  {modalItem.id ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print Only View */}
      <div className="hidden print-only p-8">
        <h1 className="text-4xl font-bold mb-2">Barcelona Trip Itinerary</h1>
        <p className="text-stone-500 mb-8">{config.startDate} to {config.endDate}</p>
        <div className="space-y-8">
          {itineraryData.map((day: any, idx: number) => (
            <div key={idx} className="border-t pt-6">
              <h2 className="text-2xl font-bold mb-4">{day.date}</h2>
              <div className="space-y-4">
                {day.events.map((event: any, eIdx: number) => (
                  <div key={eIdx} className="flex gap-4">
                    <div className="w-20 font-mono text-sm pt-1">{event.time}</div>
                    <div>
                      <h3 className="font-bold">{event.activity}</h3>
                      <p className="text-sm text-stone-600">{event.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
