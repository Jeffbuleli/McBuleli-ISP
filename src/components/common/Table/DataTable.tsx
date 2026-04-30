import React, { useMemo, useState, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Search,
  Download,
  Filter,
  MoreVertical
} from 'lucide-react';
import Pagination from './Pagination';
import './Table.module.css';

export interface ColumnDef<T> {
  id: keyof T;
  header: string;
  cell?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface RowAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (rowId: string | number) => void;
  variant?: 'default' | 'danger' | 'warning';
}

export interface DataTableProps<T extends { id?: string | number }> {
  data: T[];
  columns: ColumnDef<T>[];
  rowActions?: RowAction[];
  searchable?: boolean;
  searchPlaceholder?: string;
  filterable?: boolean;
  filters?: Array<{ id: string; label: string; options: Array<{ value: string; label: string }> }>;
  exportable?: boolean;
  onExport?: (data: T[]) => void;
  pageSize?: number;
  isLoading?: boolean;
  emptyStateMessage?: string;
  onRowClick?: (row: T) => void;
  striped?: boolean;
}

export const DataTable = React.forwardRef<HTMLDivElement, DataTableProps<any>>(
  (
    {
      data,
      columns,
      rowActions,
      searchable = true,
      searchPlaceholder = 'Search...',
      filterable = false,
      filters = [],
      exportable = false,
      onExport,
      pageSize = 10,
      isLoading = false,
      emptyStateMessage = 'No data available',
      onRowClick,
      striped = true
    },
    ref
  ) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof any; direction: 'asc' | 'desc' } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});
    const [showFilters, setShowFilters] = useState(false);

    const filteredData = useMemo(() => {
      let result = data;

      if (searchTerm) {
        result = result.filter(row =>
          columns.some(col => {
            const value = row[col.id];
            return value?.toString().toLowerCase().includes(searchTerm.toLowerCase());
          })
        );
      }

      Object.entries(appliedFilters).forEach(([filterId, filterValue]) => {
        if (filterValue) {
          const filterColumn = columns.find(col => col.id === filterId);
          if (filterColumn) {
            result = result.filter(row => row[filterColumn.id]?.toString() === filterValue);
          }
        }
      });

      return result;
    }, [data, searchTerm, appliedFilters, columns]);

    const sortedData = useMemo(() => {
      if (!sortConfig) return filteredData;

      const sorted = [...filteredData].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue == null) return 1;
        if (bValue == null) return -1;

        if (typeof aValue === 'string') {
          return sortConfig.direction === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        return sortConfig.direction === 'asc'
          ? aValue - bValue
          : bValue - aValue;
      });

      return sorted;
    }, [filteredData, sortConfig]);

    const totalPages = Math.ceil(sortedData.length / pageSize);
    const paginatedData = useMemo(() => {
      const startIdx = (currentPage - 1) * pageSize;
      return sortedData.slice(startIdx, startIdx + pageSize);
    }, [sortedData, currentPage, pageSize]);

    const handleSort = useCallback((columnId: keyof any) => {
      setSortConfig(prev => ({
        key: columnId,
        direction: prev?.key === columnId && prev.direction === 'asc' ? 'desc' : 'asc'
      }));
    }, []);

    const handleExport = useCallback(() => {
      if (onExport) {
        onExport(sortedData);
      }
    }, [sortedData, onExport]);

    return (
      <div className="data-table-wrapper" ref={ref}>
        <div className="table-toolbar">
          {searchable && (
            <div className="search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="search-input"
              />
            </div>
          )}

          <div className="toolbar-actions">
            {filterable && (
              <button
                className={`toolbar-btn ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
                title="Toggle filters"
              >
                <Filter size={18} />
              </button>
            )}

            {exportable && (
              <button
                className="toolbar-btn"
                onClick={handleExport}
                title="Export data"
              >
                <Download size={18} />
              </button>
            )}
          </div>
        </div>

        {showFilters && filters.length > 0 && (
          <div className="filters-panel">
            {filters.map(filter => (
              <div key={filter.id} className="filter-group">
                <label>{filter.label}</label>
                <select
                  value={appliedFilters[filter.id] || ''}
                  onChange={(e) => {
                    setAppliedFilters(prev => ({
                      ...prev,
                      [filter.id]: e.target.value
                    }));
                    setCurrentPage(1);
                  }}
                  className="filter-select"
                >
                  <option value="">All</option>
                  {filter.options.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="table-loading">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="table-empty">
            <p>{emptyStateMessage}</p>
          </div>
        ) : (
          <div className="table-container">
            <table className={`data-table ${striped ? 'striped' : ''}`}>
              <thead>
                <tr>
                  {columns.map(col => (
                    <th
                      key={String(col.id)}
                      style={{ width: col.width, textAlign: col.align || 'left' }}
                      className={col.sortable ? 'sortable' : ''}
                      onClick={() => col.sortable && handleSort(col.id)}
                    >
                      <div className="header-cell">
                        <span>{col.header}</span>
                        {col.sortable && (
                          <span className="sort-indicator">
                            {sortConfig?.key === col.id ? (
                              sortConfig.direction === 'asc' ? (
                                <ChevronUp size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )
                            ) : (
                              <div className="sort-placeholder"></div>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                  {rowActions && <th style={{ width: '50px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row, idx) => (
                  <tr
                    key={row.id || idx}
                    className={onRowClick ? 'clickable' : ''}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map(col => (
                      <td key={String(col.id)} style={{ textAlign: col.align || 'left' }}>
                        {col.cell ? col.cell(row[col.id], row) : row[col.id]}
                      </td>
                    ))}
                    {rowActions && (
                      <td>
                        <RowActionMenu actions={rowActions} rowId={row.id!} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={sortedData.length}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    );
  }
);

DataTable.displayName = 'DataTable';

const RowActionMenu: React.FC<{ actions: RowAction[]; rowId: string | number }> = ({
  actions,
  rowId
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="row-action-menu">
      <button
        className="action-menu-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Actions"
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div className="action-dropdown">
          {actions.map(action => (
            <button
              key={action.id}
              className={`action-item action-${action.variant || 'default'}`}
              onClick={() => {
                action.onClick(rowId);
                setIsOpen(false);
              }}
            >
              {action.icon && <span className="action-icon">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DataTable;
