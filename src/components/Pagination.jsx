export default function Pagination({ pageCount, currentPage, onPrev, onNext }) {
  return (
    <div className="pagination">
      <div className="pagination-dots">
        {Array.from({ length: pageCount }).map((_, index) => (
          <span
            key={index}
            className={`pagination-dot${index === currentPage ? ' pagination-dot-active' : ''}`}
          />
        ))}
      </div>
      <div className="pagination-arrows">
        <button
          type="button"
          className="pagination-arrow"
          onClick={onPrev}
          disabled={currentPage === 0}
          aria-label="Previous page"
        >
          ←
        </button>
        <button
          type="button"
          className="pagination-arrow"
          onClick={onNext}
          disabled={currentPage === pageCount - 1}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  )
}
