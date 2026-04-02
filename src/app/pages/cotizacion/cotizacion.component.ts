import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { HeaderComponent } from '../../components/header/header.component';
import { ProductoService, CotizacionService } from '../../core/services';
import { Producto, ProductoPrecioEscala, CrearCotizacionRequest } from '../../shared/models';

@Component({
  selector: 'app-cotizacion',
  imports: [CommonModule, ReactiveFormsModule, HeaderComponent],
  templateUrl: './cotizacion.component.html',
  styleUrl: './cotizacion.component.css'
})
export class CotizacionComponent implements OnInit {

  private fb = inject(FormBuilder);
  private productoService = inject(ProductoService);
  private cotizacionService = inject(CotizacionService);

  productos: Producto[] = [];

  /** Escalas de precio cargadas del backend (ej: Hamburguesa x50 = S/380) */
  escalas: ProductoPrecioEscala[] = [];

  cargando = false;
  error = '';

  cotizacionForm!: FormGroup;

  get items(): FormArray {
    return this.cotizacionForm.get('items') as FormArray;
  }

  get subtotal(): number {
    return this.items.controls.reduce((sum, item) => {
      const subtotalItem = item.get('subtotalItem')?.value || 0;
      return sum + subtotalItem;
    }, 0);
  }

  get total(): number {
    const descuento = this.cotizacionForm.get('descuento')?.value || 0;
    const movilidad = this.cotizacionForm.get('movilidad')?.value || 0;

    if (descuento > 0) {
      return (this.subtotal + movilidad) - descuento;
    }
    return this.subtotal + movilidad - descuento;
  }

  ngOnInit(): void {
    this.initForm();
    this.cargarProductos();
    this.cargarEscalas();
  }

  private initForm(): void {
    this.cotizacionForm = this.fb.group({
      clienteTelefono: ['', Validators.required],
      lugarEvento:     ['', Validators.required],
      tipoEvento:      [''],
      fechaEvento:     ['', Validators.required],
      notas:           [''],
      descuento:       [0, [Validators.required, Validators.min(0)]],
      movilidad:       [0, [Validators.required, Validators.min(0)]],
      horasServicio:   [''],
      items:           this.fb.array([])
    });
  }

  private cargarProductos(): void {
    this.productoService.listarActivos().subscribe({
      next: (data) => this.productos = data,
      error: () => this.error = 'No se pudieron cargar los productos. ¿Está corriendo el backend?'
    });
  }

  private cargarEscalas(): void {
    this.productoService.listarEscalas().subscribe({
      next: (data) => this.escalas = data,
      error: () => console.warn('No se pudieron cargar las escalas de precio')
    });
  }

  /**
   * Busca si existe una escala de precio para un producto+cantidad dados.
   * Ej: productoId=3 (Hamburguesa), cantidad=50 → retorna { precioTotal: 380 }
   */
  private buscarEscala(productoId: number, cantidad: number): ProductoPrecioEscala | undefined {
    return this.escalas.find(e => e.productoId === productoId && e.cantidad === cantidad);
  }

  agregarItem(): void {
    const itemGroup = this.fb.group({
      productoId:          [null, Validators.required],
      cantidad:            [null],
      esIlimitado:         [false],
      precioUnitarioManual:[null],
      nombreProducto:      [''],
      precioUnitarioVista: [0],
      subtotalItem:        [0],
    });
    this.items.push(itemGroup);
  }

  eliminarItem(index: number): void {
    this.items.removeAt(index);
  }

  onProductoSeleccionado(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const productoId = itemGroup.get('productoId')?.value;
    const producto = this.productos.find(p => p.id === +productoId);

    if (!producto) return;

    itemGroup.patchValue({ nombreProducto: producto.nombre });

    if (producto.categoria === 'ilimitado') {
      itemGroup.patchValue({
        esIlimitado: true,
        cantidad: null,
        precioUnitarioManual: null,
        precioUnitarioVista: producto.precioUnitario,
        subtotalItem: producto.precioUnitario,
      });
    } else {
      itemGroup.patchValue({
        esIlimitado: false,
        cantidad: null,
        precioUnitarioManual: null,
        precioUnitarioVista: 0,
        subtotalItem: 0,
      });
    }
  }

  /**
   * Se ejecuta cuando el usuario cambia la CANTIDAD.
   * Primero busca si hay una escala de precio en la BD (50, 100).
   * Si la encuentra, auto-llena subtotal y precio unitario.
   * Si no, recalcula con el subtotal existente.
   */
  onCantidadCambiada(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const cantidad = itemGroup.get('cantidad')?.value;
    const productoId = itemGroup.get('productoId')?.value;

    if (!cantidad || cantidad <= 0) {
      itemGroup.patchValue({ precioUnitarioVista: 0, subtotalItem: 0, precioUnitarioManual: null });
      return;
    }

    // Buscar escala de precio en la BD (ej: 50 uds → S/380)
    if (productoId) {
      const escala = this.buscarEscala(+productoId, +cantidad);
      if (escala) {
        const precioCalculado = escala.precioTotal / cantidad;
        itemGroup.patchValue({
          subtotalItem: escala.precioTotal,
          precioUnitarioVista: precioCalculado,
          precioUnitarioManual: precioCalculado,
        });
        return;
      }
    }

    // Si no hay escala, recalcular con el subtotal existente
    const subtotalActual = itemGroup.get('subtotalItem')?.value || 0;
    if (subtotalActual > 0) {
      const precioCalculado = subtotalActual / cantidad;
      itemGroup.patchValue({
        precioUnitarioVista: precioCalculado,
        precioUnitarioManual: precioCalculado,
      });
    }
  }

  /**
   * Se ejecuta cuando el usuario edita el SUBTOTAL directamente.
   * Calcula: precioUnitario = subtotal / cantidad.
   */
  onSubtotalCambiado(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const cantidad = itemGroup.get('cantidad')?.value;
    const subtotal = itemGroup.get('subtotalItem')?.value;

    if (cantidad && cantidad > 0 && subtotal != null && subtotal >= 0) {
      const precioCalculado = subtotal / cantidad;
      itemGroup.patchValue({
        precioUnitarioVista: precioCalculado,
        precioUnitarioManual: precioCalculado,
      });
    }
  }

  /**
   * Se ejecuta cuando el usuario edita el PRECIO UNITARIO.
   * Calcula: subtotal = cantidad * precioUnitario.
   */
  onPrecioManualCambiado(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const cantidad = itemGroup.get('cantidad')?.value;
    const precioManual = itemGroup.get('precioUnitarioManual')?.value;

    if (cantidad && cantidad > 0 && precioManual != null && precioManual >= 0) {
      itemGroup.patchValue({
        precioUnitarioVista: precioManual,
        subtotalItem: cantidad * precioManual,
      });
    }
  }

  generarPdf(): void {
    if (this.cotizacionForm.invalid) {
      this.cotizacionForm.markAllAsTouched();
      this.error = 'Completa los campos obligatorios';
      return;
    }

    if (this.items.length === 0) {
      this.error = 'Agrega al menos un item';
      return;
    }

    this.cargando = true;
    this.error = '';

    const formValue = this.cotizacionForm.value;

    const request: CrearCotizacionRequest = {
      clienteTelefono: formValue.clienteTelefono,
      fechaEvento: formValue.fechaEvento,
      tipoEvento: formValue.tipoEvento || '',
      lugarEvento: formValue.lugarEvento,
      notas: formValue.notas || '',
      descuento: formValue.descuento || 0,
      movilidad: formValue.movilidad || 0,
      horasServicio: formValue.horasServicio || '',
      items: formValue.items.map((item: any) => ({
        productoId: +item.productoId,
        cantidad: item.esIlimitado ? null : +item.cantidad,
        esIlimitado: item.esIlimitado,
        precioUnitarioManual: item.precioUnitarioManual ? +item.precioUnitarioManual : null,
      })),
    };

    this.cotizacionService.crearYDescargarPdf(request).subscribe({
      next: (pdfBlob) => {
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        // Armar nombre: "Cotizacion ABYLU - 50 Hamburguesa, Ilimitado Popcorn.pdf"
        const itemsDesc = formValue.items
          .map((item: any) => {
            const nombre = item.nombreProducto || 'Producto';
            if (item.esIlimitado && nombre.toLowerCase() === 'dispensador de bebidas') {
              return `16 Lt. ${nombre}`;
            }
            return item.esIlimitado ? `Ilimitado ${nombre}` : `${item.cantidad} ${nombre}`;
          })
          .join(', ');
        a.download = `Cotizacion ABYLU - ${itemsDesc}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.cargando = false;
      },
      error: (err) => {
        this.error = 'Error al generar el PDF. Verifica los datos e intenta de nuevo.';
        this.cargando = false;
        console.error('Error:', err);
      }
    });
  }
}
