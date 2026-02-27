export default function ApprovalsPage() {
  return (
    <div>
      <h1 className="p-6 text-xl font-bold">Approvals</h1>
      <div className="fixed bottom-16 left-0 right-0 md:hidden bg-white border-t border-gray-200 p-3 flex gap-2 z-50">
        <button className="flex-1 bg-red-600 text-white rounded-lg py-3 font-semibold text-sm">
          Approve
        </button>
        <button className="flex-1 bg-gray-200 text-gray-800 rounded-lg py-3 font-semibold text-sm">
          Request Changes
        </button>
      </div>
    </div>
  );
}
