import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NavLink, useNavigateTo } from '@/components/layout/nav-link';

function Page() {
    const navigateTo = useNavigateTo();
    return (
        <div>
            <NavLink to="/list?namespace=team-a&view=wide">Link</NavLink>
            <button onClick={() => navigateTo('/list?namespace=team-b')}>Go</button>
            <button onClick={() => navigateTo('/list')}>Plain</button>
        </div>
    );
}

function renderPage() {
    const root = createRootRoute({ component: Outlet });
    const index = createRoute({ getParentRoute: () => root, path: '/', component: Page });
    const list = createRoute({ getParentRoute: () => root, path: '/list', component: () => <p>list</p> });
    const router = createRouter({
        routeTree: root.addChildren([index, list]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(<RouterProvider router={router} />);
    return router;
}

describe('NavLink and useNavigateTo', () => {
    it('splits a query string off the path and hands it to the router as search', async () => {
        const router = renderPage();
        const link = await screen.findByRole('link', { name: 'Link' });
        expect(link).toHaveAttribute('href', '/list?namespace=team-a&view=wide');
        await userEvent.click(screen.getByRole('button', { name: 'Go' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/list'));
        expect(router.state.location.search).toEqual({ namespace: 'team-b' });
    });

    it('navigates without search when the path has no query', async () => {
        const router = renderPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Plain' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/list'));
        expect(router.state.location.search).toEqual({});
    });
});
