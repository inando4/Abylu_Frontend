import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HeaderComponent } from '../../components/header/header.component';
import { ProductoService } from '../../core/services';
import { CrearProductoRequest, ProductoGestion } from '../../shared/models';

/** Grupo visual de la lista: una categoría con sus productos activos. */
interface GrupoCategoria {
  categoria: string;
  productos: ProductoGestion[];
}

/**
 * Validator del FormArray de escalas: las cantidades no pueden repetirse
 * (chocarían con el unique (producto_id, cantidad) — el backend respondería 400).
 */
function cantidadesUnicas(control: AbstractControl): ValidationErrors | null {
  const cantidades = (control as FormArray).controls
    .map(g => g.get('cantidad')?.value)
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(Number);
  return new Set(cantidades).size === cantidades.length
    ? null
    : { cantidadesDuplicadas: true };
}

/**
 * Gestión de catálogo (Tarea 3). Misma página para ambos roles: el backend decide
 * el ámbito según el token (CLIENTE → catálogo real, INVITADO → catálogo demo).
 *
 * Tres piezas de UI:
 * - Lista de activos agrupada por categoría + sección colapsable de desactivados.
 * - Bottom-sheet con el formulario de crear/editar (patrón del picker de cotización).
 * - Confirmación de desactivar (patrón confirm-dialog global).
 */
@Component({
  selector: 'app-productos',
  imports: [CommonModule, ReactiveFormsModule, HeaderComponent],
  templateUrl: './productos.component.html',
  styleUrl: './productos.component.css'
})
export class ProductosComponent implements OnInit {

  private productoService = inject(ProductoService);
  private fb = inject(FormBuilder);

  productos: ProductoGestion[] = [];
  categorias: string[] = [];
  cargando = false;
  error = '';

  /** Búsqueda por nombre dentro del catálogo (client-side, la lista ya está cargada). */
  busqueda = '';

  /** Sheet de formulario. `editando` = null → modo crear. */
  sheetOpen = false;
  editando: ProductoGestion | null = null;
  guardando = false;
  errorGuardar = '';

  form: FormGroup = this.fb.group({
    nombre: ['', Validators.required],
    precioUnitario: [0, [Validators.required, Validators.min(0)]],
    categoria: ['', Validators.required],
    escalas: this.fb.array([], cantidadesUnicas),
  });

  /** Confirmación de desactivar (soft delete, reversible). */
  confirmProducto: ProductoGestion | null = null;
  desactivando = false;

  /** Sección de desactivados (colapsada por defecto). */
  desactivadosOpen = false;
  reactivandoId: number | null = null;

  ngOnInit(): void {
    // Precio fijo y escalas son excluyentes: los ilimitados cobran SOLO el precio
    // fijo (se descartan las escalas), y el resto de categorías SOLO escalas (el
    // precio fijo se fuerza a 0, igual que en el catálogo real).
    this.form.get('categoria')!.valueChanges.subscribe(categoria => {
      const precio = this.form.get('precioUnitario')!;
      if (categoria === 'ilimitado') {
        this.escalas.clear();
        precio.setValidators([Validators.required, Validators.min(0.01)]);
      } else {
        precio.setValue(0, { emitEvent: false });
        precio.setValidators([Validators.required, Validators.min(0)]);
      }
      precio.updateValueAndValidity({ emitEvent: false });
    });

    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';

    this.productoService.listarGestion().subscribe({
      next: (data) => {
        this.productos = data;
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudo cargar el catálogo. ¿Está corriendo el backend?';
        this.cargando = false;
      }
    });

    this.productoService.listarCategorias().subscribe({
      next: (data) => this.categorias = data,
    });
  }

  // ══════════ Derivados para la vista ══════════

  get activos(): ProductoGestion[] {
    return this.productos.filter(p => p.activo);
  }

  get desactivados(): ProductoGestion[] {
    return this.productos.filter(p => !p.activo);
  }

  /** Activos que coinciden con la búsqueda (sin término, todos). */
  get activosFiltrados(): ProductoGestion[] {
    const termino = this.busqueda.trim().toLowerCase();
    if (!termino) return this.activos;
    return this.activos.filter(p => p.nombre.toLowerCase().includes(termino));
  }

  /** Activos (filtrados) agrupados por categoría, en el orden en que aparecen. */
  get grupos(): GrupoCategoria[] {
    const mapa = new Map<string, ProductoGestion[]>();
    for (const p of this.activosFiltrados) {
      const lista = mapa.get(p.categoria) ?? [];
      lista.push(p);
      mapa.set(p.categoria, lista);
    }
    return [...mapa.entries()].map(([categoria, productos]) => ({ categoria, productos }));
  }

  onBusquedaCambiada(event: Event): void {
    this.busqueda = (event.target as HTMLInputElement).value;
  }

  limpiarBusqueda(): void {
    this.busqueda = '';
  }

  /** Mismo formato de categoría que usa el picker de cotización. */
  formatCategoria(categoria: string): string {
    if (categoria === 'ilimitado') return 'Ilimitado';
    if (categoria === 'snack') return 'Snack';
    return categoria.charAt(0).toUpperCase() + categoria.slice(1);
  }

  // ══════════ Sheet de crear / editar ══════════

  get escalas(): FormArray {
    return this.form.get('escalas') as FormArray;
  }

  /** true si la categoría elegida en el form es 'ilimitado' (precio fijo, sin escalas). */
  get esIlimitado(): boolean {
    return this.form.get('categoria')?.value === 'ilimitado';
  }

  abrirNuevo(): void {
    this.editando = null;
    this.errorGuardar = '';
    this.escalas.clear();
    this.form.reset({
      nombre: '',
      precioUnitario: 0,
      // Por defecto una categoría con escalas (no 'ilimitado', que es el caso especial).
      categoria: this.categorias.find(c => c !== 'ilimitado') ?? this.categorias[0] ?? '',
    });
    this.sheetOpen = true;
  }

  abrirEditar(producto: ProductoGestion): void {
    this.editando = producto;
    this.errorGuardar = '';
    this.escalas.clear();
    // El reset va ANTES de poblar las escalas: resetear después las dejaría en null.
    this.form.reset({
      nombre: producto.nombre,
      precioUnitario: producto.precioUnitario,
      categoria: producto.categoria,
    });
    for (const e of producto.escalas) {
      this.escalas.push(this.crearGrupoEscala(e.cantidad, e.precioTotal));
    }
    this.sheetOpen = true;
  }

  cerrarSheet(): void {
    if (!this.guardando) {
      this.sheetOpen = false;
    }
  }

  private crearGrupoEscala(cantidad: number | null = null, precioTotal: number | null = null): FormGroup {
    return this.fb.group({
      cantidad: [cantidad, [Validators.required, Validators.min(1)]],
      precioTotal: [precioTotal, [Validators.required, Validators.min(0.01)]],
    });
  }

  agregarEscala(): void {
    this.escalas.push(this.crearGrupoEscala());
  }

  quitarEscala(index: number): void {
    this.escalas.removeAt(index);
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value;
    // Siempre la lista completa: el backend reemplaza las escalas en bloque.
    const request: CrearProductoRequest = {
      nombre: (v.nombre as string).trim(),
      precioUnitario: Number(v.precioUnitario),
      categoria: v.categoria,
      escalas: this.escalas.controls.map(g => ({
        cantidad: Number(g.value.cantidad),
        precioTotal: Number(g.value.precioTotal),
      })),
    };

    const llamada = this.editando
      ? this.productoService.actualizar(this.editando.id, request)
      : this.productoService.crear(request);

    this.guardando = true;
    this.errorGuardar = '';

    llamada.subscribe({
      next: () => {
        this.guardando = false;
        this.sheetOpen = false;
        this.cargar();
      },
      error: (err) => {
        this.guardando = false;
        this.errorGuardar = err?.error?.message ?? 'No se pudo guardar el producto. Inténtalo de nuevo.';
      }
    });
  }

  // ══════════ Desactivar (soft delete) / Reactivar ══════════

  pedirDesactivar(producto: ProductoGestion): void {
    this.confirmProducto = producto;
  }

  cancelarDesactivar(): void {
    if (!this.desactivando) {
      this.confirmProducto = null;
    }
  }

  confirmarDesactivar(): void {
    if (!this.confirmProducto) return;

    this.desactivando = true;
    this.productoService.eliminar(this.confirmProducto.id).subscribe({
      next: () => {
        this.desactivando = false;
        this.confirmProducto = null;
        this.desactivadosOpen = true; // que se vea a dónde fue
        this.cargar();
      },
      error: () => {
        this.desactivando = false;
        this.confirmProducto = null;
        this.error = 'No se pudo desactivar el producto. Inténtalo de nuevo.';
      }
    });
  }

  /** PUT con activo=true y escalas=null (no tocar): recupera el producto tal cual estaba. */
  reactivar(producto: ProductoGestion): void {
    this.reactivandoId = producto.id;
    this.productoService.actualizar(producto.id, {
      nombre: producto.nombre,
      precioUnitario: producto.precioUnitario,
      categoria: producto.categoria,
      activo: true,
      escalas: null,
    }).subscribe({
      next: () => {
        this.reactivandoId = null;
        this.cargar();
      },
      error: () => {
        this.reactivandoId = null;
        this.error = 'No se pudo reactivar el producto. Inténtalo de nuevo.';
      }
    });
  }
}
