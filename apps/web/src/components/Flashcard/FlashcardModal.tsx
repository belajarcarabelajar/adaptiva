import React from 'react';

interface FlashcardModalProps {
  showAddFlashcardModal: boolean;
  editingFlashcardId: string | null;
  flashcardFormState: { term: string, definition: string };
  setFlashcardFormState: React.Dispatch<React.SetStateAction<{ term: string, definition: string }>>;
  setShowAddFlashcardModal: (show: boolean) => void;
  handleSaveFlashcard: () => void;
}

const FlashcardModal: React.FC<FlashcardModalProps> = ({
  showAddFlashcardModal,
  editingFlashcardId,
  flashcardFormState,
  setFlashcardFormState,
  setShowAddFlashcardModal,
  handleSaveFlashcard
}) => {
  if (!showAddFlashcardModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-brand-white dark:bg-brand-black p-5 rounded-lg shadow-xl w-full max-w-md border border-brand-mediumGray dark:border-gray-700">
            <h3 className="text-xl font-semibold text-brand-blue dark:text-blue-300 mb-4">{editingFlashcardId ? 'Edit Kartu' : 'Tambah Kartu Baru'}</h3>
            <div className="space-y-3">
                <div>
                    <label htmlFor="fc-term" className="block text-sm font-medium text-brand-blue dark:text-blue-300">Istilah/Pertanyaan</label>
                    <input type="text" id="fc-term" value={flashcardFormState.term} onChange={e => setFlashcardFormState(s => ({...s, term: e.target.value}))} className="mt-1 w-full p-2 border border-brand-mediumGray dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                    <label htmlFor="fc-definition" className="block text-sm font-medium text-brand-blue dark:text-blue-300">Definisi/Jawaban</label>
                    <textarea id="fc-definition" value={flashcardFormState.definition} onChange={e => setFlashcardFormState(s => ({...s, definition: e.target.value}))} rows={3} className="mt-1 w-full p-2 border border-brand-mediumGray dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100"></textarea>
                </div>
            </div>
            <div className="mt-5 flex justify-end space-x-2">
                <button onClick={() => setShowAddFlashcardModal(false)} className="px-3 py-1.5 text-sm font-medium text-brand-black/80 dark:text-gray-300 bg-brand-lightGray dark:bg-gray-600 hover:bg-brand-mediumGray dark:hover:bg-gray-500 rounded-md">Batal</button>
                <button onClick={handleSaveFlashcard} className="px-3 py-1.5 text-sm font-medium text-brand-white bg-brand-green hover:bg-green-700 rounded-md">Simpan</button>
            </div>
        </div>
    </div>
  );
};

export default FlashcardModal;
