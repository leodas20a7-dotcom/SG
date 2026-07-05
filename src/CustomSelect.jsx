import { useState, useEffect, useRef } from "react";
import { FaSearch } from "react-icons/fa";

function CustomSelect({ value, onChange, options, placeholder = "Select option", className = "", error = false, heightClass = "h-11", searchable = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = searchable 
    ? options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  const selectedOption = options.find(o => String(o.value) === String(value));

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full ${heightClass} border px-3 rounded-xl flex items-center justify-between transition-all text-xs text-left ${
          isOpen
            ? "border-blue-500 ring-4 ring-blue-500/10 bg-white"
            : error
              ? "border-red-400 focus:ring-2 focus:ring-red-300 bg-[#F4F6F9]"
              : "border-gray-200 hover:border-gray-300 bg-[#F4F6F9] hover:bg-slate-100/60"
        }`}
      >
        <span className={selectedOption ? "text-gray-855 font-medium" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 transition-transform duration-200 shrink-0 ml-2 ${isOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {/* Dropdown Options List */}
      {isOpen && (
        <div className={`absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] border border-gray-100 overflow-y-auto max-h-60 z-[1001] pb-1 flex flex-col ${!searchable ? 'pt-1' : ''}`}>
          {searchable && (
            <div className="px-3 py-2 sticky top-0 bg-white border-b border-slate-100 z-10">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border-transparent rounded-lg bg-slate-100 focus:bg-slate-200 focus:border-transparent focus:ring-0 outline-none transition-colors"
                />
              </div>
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500 text-center">No options found</div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = String(opt.value) === String(value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center ${
                  isSelected
                    ? "bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600"
                    : "text-gray-700 hover:bg-gray-50 font-medium border-l-2 border-transparent"
                }`}
              >
                {opt.label}
              </button>
            );
          })
          )}
        </div>
      )}
    </div>
  );
}

export default CustomSelect;
