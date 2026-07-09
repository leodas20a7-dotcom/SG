function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "danger" }) {
  const variantStyles = {
    danger: {
      icon: "🗑️",
      iconBg: "bg-red-100",
      confirmBtn: "bg-red-500 hover:bg-red-600 shadow-red-200",
    },
    warning: {
      icon: "⚠️",
      iconBg: "bg-amber-100",
      confirmBtn: "bg-amber-500 hover:bg-amber-600 shadow-amber-200",
    },
    info: {
      icon: "ℹ️",
      iconBg: "bg-blue-100",
      confirmBtn: "bg-blue-500 hover:bg-blue-600 shadow-blue-200",
    },
  };

  const s = variantStyles[variant] || variantStyles.danger;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className={`w-16 h-16 rounded-2xl ${s.iconBg} flex items-center justify-center text-3xl mb-5 shadow-sm`}>
          {s.icon}
        </div>

        {/* Message */}
        <h3 className="text-lg font-bold text-slate-800 mb-2 leading-snug">
          Are you sure?
        </h3>
        <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed">
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition active:scale-95"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm shadow-md transition active:scale-95 ${s.confirmBtn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
