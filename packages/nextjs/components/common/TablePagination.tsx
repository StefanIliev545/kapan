"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface TablePaginationProps {
  /** Current page index (0-based) */
  pageIndex: number;
  /** Total number of pages */
  pageCount: number;
  /** Callback when page changes */
  onPageChange: (pageIndex: number) => void;
  /** Can navigate to previous page */
  canPreviousPage: boolean;
  /** Can navigate to next page */
  canNextPage: boolean;
  /** Optional: total number of items */
  totalItems?: number;
  /** Optional: current page size */
  pageSize?: number;
}

/**
 * Reusable table pagination component with Previous/Next buttons and page indicator.
 * Designed for use with TanStack Table but can work with any paginated data.
 */
export function TablePagination({
  pageIndex,
  pageCount,
  onPageChange,
  canPreviousPage,
  canNextPage,
  totalItems,
  pageSize,
}: TablePaginationProps) {
  const handleFirstPage = React.useCallback(() => onPageChange(0), [onPageChange]);
  const handlePreviousPage = React.useCallback(() => onPageChange(pageIndex - 1), [onPageChange, pageIndex]);
  const handleNextPage = React.useCallback(() => onPageChange(pageIndex + 1), [onPageChange, pageIndex]);
  const handleLastPage = React.useCallback(() => onPageChange(pageCount - 1), [onPageChange, pageCount]);

  // Don't render if there's only one page or no pages
  if (pageCount <= 1) {
    return null;
  }

  // Calculate item range for display
  const startItem = totalItems && pageSize ? pageIndex * pageSize + 1 : undefined;
  const endItem = totalItems && pageSize ? Math.min((pageIndex + 1) * pageSize, totalItems) : undefined;

  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {/* First page button */}
      <button
        onClick={handleFirstPage}
        disabled={!canPreviousPage}
        className="btn btn-ghost btn-xs disabled:opacity-30"
        aria-label="Go to first page"
      >
        <ChevronsLeft className="size-4" />
      </button>

      {/* Previous page button */}
      <button
        onClick={handlePreviousPage}
        disabled={!canPreviousPage}
        className="btn btn-ghost btn-sm gap-1 disabled:opacity-30"
        aria-label="Go to previous page"
      >
        <ChevronLeft className="size-4" />
        <span className="hidden sm:inline">Previous</span>
      </button>

      {/* Page indicator */}
      <div className="text-base-content/70 flex items-center gap-2 px-3 text-sm">
        <span className="font-medium tabular-nums">
          Page {pageIndex + 1} of {pageCount}
        </span>
        {startItem !== undefined && endItem !== undefined && totalItems !== undefined && (
          <span className="text-base-content/50 hidden text-xs sm:inline">
            ({startItem}-{endItem} of {totalItems})
          </span>
        )}
      </div>

      {/* Next page button */}
      <button
        onClick={handleNextPage}
        disabled={!canNextPage}
        className="btn btn-ghost btn-sm gap-1 disabled:opacity-30"
        aria-label="Go to next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="size-4" />
      </button>

      {/* Last page button */}
      <button
        onClick={handleLastPage}
        disabled={!canNextPage}
        className="btn btn-ghost btn-xs disabled:opacity-30"
        aria-label="Go to last page"
      >
        <ChevronsRight className="size-4" />
      </button>
    </div>
  );
}
