import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { useToast } from "./Toast";

function Circulars({ role }) {
  const [circulars, setCirculars] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast, ToastContainer } = useToast();

  async function fetchCirculars() {
    try {
      const { data } = await supabase
        .from("circulars")
        .select("*")
        .order("created_at", { ascending: false });
      setCirculars(data || []);
    } catch {
      showToast("Could not load circulars.", "error");
    }
  }

  async function addCircular(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showToast("Please fill in all fields.", "error");
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("circulars").insert([
        {
          title: title.trim(),
          content: content.trim(),
          created_by: user?.id,
        },
      ]);
      if (error) throw error;
      showToast("Circular announcement published!", "success");
      setTitle("");
      setContent("");
      fetchCirculars();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCirculars();
  }, []);

  return (
    <>
      <ToastContainer />
      <div className="mt-6">
        <h2 className="text-xl font-bold mb-4 text-gray-800">📢 Official Announcements & Circulars</h2>

        {role === "admin" && (
          <div className="glass-card rounded-2xl p-6 mb-8 ring-1 ring-blue-200">
            <h3 className="text-lg font-semibold mb-4 text-gray-700">✏️ Broadcast New Circular</h3>
            <form onSubmit={addCircular} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Mandatory Uniform Updates"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-12 border border-gray-300 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Message Content</label>
                <textarea
                  placeholder="Type announcement details here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows="4"
                  className="w-full border border-gray-300 p-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition shadow-md"
              >
                {loading ? "Publishing..." : "Broadcast Circular"}
              </button>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {circulars.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-gray-400">
              No official announcements posted yet.
            </div>
          ) : (
            circulars.map((circ) => (
              <div key={circ.id} className="glass-card rounded-2xl p-6 ring-1 ring-gray-100 hover:shadow-md transition bg-white/80">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-lg font-bold text-gray-800">📌 {circ.title}</h4>
                  <span className="text-xs text-gray-400">
                    {new Date(circ.created_at).toLocaleDateString([], { dateStyle: "medium" })}
                  </span>
                </div>
                <p className="text-gray-600 text-sm whitespace-pre-line leading-relaxed">{circ.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default Circulars;
